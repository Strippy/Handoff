// Handoff Pro billing: Stripe subscription + plan limits.
// Pro is OFF until an admin switches it on. While off, nothing is gated.
// Stripe state lives in server-only entities; the browser only sees what `status` returns.
import { createClientFromRequest } from "npm:@base44/sdk";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Row = Record<string, any>;
const items = (res: unknown): Row[] => (Array.isArray(res) ? res : (res as { items?: Row[] })?.items || []);
const okOrigin = (o: unknown): o is string => typeof o === "string" && /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.base44\.app$/i.test(o);

// Plan rules. Free = everyone else while Pro is on.
const RULES = {
  amount: 850, // A$8.50
  currency: "aud",
  interval: "month",
  free_active_listings: 2,
  free_scans_per_30d: 3,
  free_open_offers: 3,
  early_access_hours: 48,
  founding_count: 100,
  founding_free_months: 12,
};
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

const stripeKey = () => Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeMode = () => (stripeKey().includes("_live_") ? "live" : stripeKey() ? "test" : "none");

async function stripe(path: string, method = "GET", params?: [string, string][]) {
  const key = stripeKey();
  if (!key) throw new HttpError(503, "Payments aren't connected yet.");
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, j?.error?.message || `Stripe returned ${r.status}`);
  return j;
}

const periodEnd = (sub: Row): string => {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : "";
};

async function getBilling(db: any): Promise<Row | null> {
  return items(await db.AppConfig.filter({ key: "billing" }))[0] || null;
}

async function saveSubscription(db: any, userId: string, email: string, sub: Row, customerId: string) {
  const data = {
    user_id: userId,
    email: email || "",
    stripe_customer_id: customerId || (typeof sub.customer === "string" ? sub.customer : sub.customer?.id) || "",
    stripe_subscription_id: sub.id || "",
    status: sub.status || "",
    current_period_end: periodEnd(sub),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    livemode: !!sub.livemode,
    checked_at: new Date().toISOString(),
  };
  const existing = items(await db.Subscription.filter({ user_id: userId }))[0];
  if (existing) await db.Subscription.update(existing.id, data); else await db.Subscription.create(data);
  return data;
}

// Re-check Stripe at most every 6h, or right away once the paid period has ended.
async function freshSubscription(db: any, userId: string): Promise<Row | null> {
  const row = items(await db.Subscription.filter({ user_id: userId }))[0];
  if (!row?.stripe_subscription_id) return row || null;
  const stale = !row.checked_at || Date.now() - Date.parse(row.checked_at) > 6 * 3600_000 ||
    (row.current_period_end && Date.parse(row.current_period_end) < Date.now());
  if (!stale || !stripeKey()) return row;
  try {
    const sub = await stripe(`/subscriptions/${row.stripe_subscription_id}`);
    return { ...row, ...(await saveSubscription(db, userId, row.email, sub, row.stripe_customer_id)) };
  } catch {
    return row;
  }
}

async function foundingUntil(db: any, userId: string, billing: Row | null): Promise<string> {
  if (!billing?.pro_launched_at) return "";
  const until = new Date(Date.parse(billing.pro_launched_at));
  until.setMonth(until.getMonth() + RULES.founding_free_months);
  if (until.getTime() < Date.now()) return "";
  // Founding = one of the first 100 builder profiles ever created (server-side order, can't be self-claimed).
  const first = items(await db.BuilderProfile.filter({ user_id: { $exists: true } }, { sort: "created_date", limit: RULES.founding_count, fields: ["user_id"] }));
  return first.some((p) => p.user_id === userId) ? until.toISOString() : "";
}

async function resolvePlan(db: any, me: Row | null, billing: Row | null) {
  const enabled = !!billing?.pro_enabled;
  const out: Row = {
    pro_enabled: enabled,
    is_pro: false,
    source: null,
    pro_until: "",
    price: { amount: billing?.price_amount || RULES.amount, currency: (billing?.price_currency || RULES.currency).toUpperCase(), interval: RULES.interval },
    checkout_ready: !!(billing?.stripe_price_id && stripeKey()),
    test_mode: stripeMode() === "test",
    limits: {
      active_listings: RULES.free_active_listings,
      scans_per_30d: RULES.free_scans_per_30d,
      open_offers: RULES.free_open_offers,
      early_access_hours: RULES.early_access_hours,
    },
    usage: null,
    subscription: null,
    is_admin: me?.role === "admin",
  };
  if (!me?.id) return out;

  const sub = await freshSubscription(db, me.id);
  if (sub?.stripe_subscription_id) {
    out.subscription = { status: sub.status, current_period_end: sub.current_period_end, cancel_at_period_end: !!sub.cancel_at_period_end };
  }
  if (me.role === "admin") {
    out.is_pro = true; out.source = "admin";
  } else if (sub && PRO_STATUSES.has(sub.status) && (!sub.current_period_end || Date.parse(sub.current_period_end) > Date.now())) {
    out.is_pro = true; out.source = "subscription"; out.pro_until = sub.current_period_end;
  } else {
    const until = await foundingUntil(db, me.id, billing);
    if (until) { out.is_pro = true; out.source = "founding"; out.pro_until = until; }
  }

  if (enabled && !out.is_pro) {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [listings, scans, offers] = await Promise.all([
      db.Listing.count({ seller_id: me.id, status: { $in: ["active", "reserved"] } }),
      db.ProjectScan.count({ owner_id: me.id, created_date: { $gte: since } }),
      // offers this buyer sent themselves (a seller's counter doesn't use up the buyer's allowance)
      db.Offer.count({ buyer_id: me.id, created_by_id: me.id, status: "pending" }),
    ]);
    out.usage = { active_listings: Number(listings) || 0, scans_30d: Number(scans) || 0, open_offers: Number(offers) || 0 };
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    let me: Row | null = null;
    try { me = await base44.auth.me(); } catch { me = null; }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");
    const isAdmin = () => me?.role === "admin";
    const needUser = () => { if (!me?.id) throw new HttpError(401, "Sign in first."); };
    const needAdmin = () => { if (!isAdmin()) throw new HttpError(403, "Only an app admin can do that."); };
    let billing = await getBilling(db);

    if (action === "status") {
      return Response.json(await resolvePlan(db, me, billing));
    }

    // ---------- admin ----------
    if (action === "admin_status") {
      needAdmin();
      const subs = items(await db.Subscription.filter({ status: { $in: ["active", "trialing", "past_due"] } }, { limit: 500 }));
      return Response.json({
        pro_enabled: !!billing?.pro_enabled,
        pro_launched_at: billing?.pro_launched_at || "",
        stripe_mode: stripeMode(),
        price_ready: !!billing?.stripe_price_id,
        price_livemode: !!billing?.stripe_livemode,
        price: { amount: billing?.price_amount || RULES.amount, currency: (billing?.price_currency || RULES.currency).toUpperCase() },
        active_subscribers: subs.filter((s) => s.livemode === (stripeMode() === "live")).length,
        rules: RULES,
      });
    }

    if (action === "admin_setup_price") {
      needAdmin();
      const live = stripeMode() === "live";
      if (billing?.stripe_price_id && billing.stripe_livemode === live && !body.force) {
        return Response.json({ ok: true, price_id: billing.stripe_price_id, reused: true });
      }
      const product = await stripe("/products", "POST", [
        ["name", "Handoff Pro"],
        ["description", "Unlimited listings and code scans, 48-hour early access to new listings, listing insights."],
      ]);
      const price = await stripe("/prices", "POST", [
        ["product", product.id],
        ["unit_amount", String(RULES.amount)],
        ["currency", RULES.currency],
        ["recurring[interval]", RULES.interval],
        ["nickname", "Handoff Pro monthly"],
      ]);
      const patch = {
        stripe_product_id: product.id, stripe_price_id: price.id, stripe_livemode: !!price.livemode,
        price_amount: price.unit_amount, price_currency: price.currency,
      };
      if (billing) await db.AppConfig.update(billing.id, patch); else billing = await db.AppConfig.create({ key: "billing", pro_enabled: false, ...patch });
      return Response.json({ ok: true, price_id: price.id, livemode: !!price.livemode });
    }

    if (action === "admin_toggle") {
      needAdmin();
      const enabled = !!body.enabled;
      if (enabled && !billing?.stripe_price_id) throw new HttpError(409, "Create the Pro price first.");
      const patch: Row = { pro_enabled: enabled };
      if (enabled && !billing?.pro_launched_at) patch.pro_launched_at = new Date().toISOString();
      if (billing) await db.AppConfig.update(billing.id, patch); else await db.AppConfig.create({ key: "billing", ...patch });
      return Response.json({ ok: true, pro_enabled: enabled });
    }

    // ---------- members ----------
    if (action === "checkout") {
      needUser();
      // Admins can try a test-card checkout before launch; everyone else waits until Pro is on.
      if (!billing?.pro_enabled && !(isAdmin() && stripeMode() === "test")) throw new HttpError(409, "Pro isn't switched on yet — everything is free right now.");
      if (!billing?.stripe_price_id) throw new HttpError(503, "Payments aren't set up yet.");
      const priceId = String(billing.stripe_price_id);
      if (!okOrigin(body.origin)) throw new HttpError(400, "Bad origin");
      const plan = await resolvePlan(db, me, billing);
      if (plan.source === "subscription" || (plan.subscription && PRO_STATUSES.has(plan.subscription.status))) {
        throw new HttpError(409, "You already have a Pro subscription.");
      }
      const existing = items(await db.Subscription.filter({ user_id: me!.id }))[0];
      let customerId = existing?.stripe_customer_id || "";
      if (customerId) {
        try { await stripe(`/customers/${customerId}`); } catch { customerId = ""; }
      }
      if (!customerId) {
        const customer = await stripe("/customers", "POST", [
          ["email", me!.email || ""],
          ["metadata[user_id]", me!.id],
        ]);
        customerId = customer.id;
        if (existing) await db.Subscription.update(existing.id, { stripe_customer_id: customerId });
        else await db.Subscription.create({ user_id: me!.id, email: me!.email || "", stripe_customer_id: customerId, status: "none" });
      }
      const session = await stripe("/checkout/sessions", "POST", [
        ["mode", "subscription"],
        ["customer", customerId],
        ["client_reference_id", me!.id],
        ["line_items[0][price]", priceId],
        ["line_items[0][quantity]", "1"],
        ["subscription_data[metadata][user_id]", me!.id],
        ["allow_promotion_codes", "true"],
        ["success_url", `${body.origin}/pro?session_id={CHECKOUT_SESSION_ID}`],
        ["cancel_url", `${body.origin}/pro?cancelled=1`],
      ]);
      return Response.json({ url: session.url });
    }

    if (action === "confirm") {
      needUser();
      const id = String(body.session_id || "");
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new HttpError(400, "Bad session");
      const session = await stripe(`/checkout/sessions/${id}?expand[]=subscription`);
      if (session.client_reference_id !== me!.id) throw new HttpError(403, "That checkout belongs to someone else.");
      if (session.status !== "complete" || !session.subscription) throw new HttpError(409, "Checkout isn't finished yet.");
      const sub = typeof session.subscription === "string" ? await stripe(`/subscriptions/${session.subscription}`) : session.subscription;
      await saveSubscription(db, me!.id, me!.email || "", sub, typeof session.customer === "string" ? session.customer : session.customer?.id);
      return Response.json(await resolvePlan(db, me, billing));
    }

    if (action === "cancel" || action === "resume") {
      needUser();
      const row = items(await db.Subscription.filter({ user_id: me!.id }))[0];
      if (!row?.stripe_subscription_id) throw new HttpError(404, "No subscription found.");
      const sub = await stripe(`/subscriptions/${row.stripe_subscription_id}`, "POST", [["cancel_at_period_end", action === "cancel" ? "true" : "false"]]);
      await saveSubscription(db, me!.id, row.email, sub, row.stripe_customer_id);
      return Response.json(await resolvePlan(db, me, billing));
    }

    throw new HttpError(400, "Unknown action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: (error as Error).message || "Billing request failed" }, { status });
  }
});
