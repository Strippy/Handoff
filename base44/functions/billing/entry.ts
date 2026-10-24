// Handoff billing: two Stripe subscriptions, each OFF until an admin switches it on (Pro + seller licence).
//   pro    — Handoff Pro, A$8.50/month: lifts free-plan limits.
//   seller — Seller licence, A$50 every 3 months: needed to sell or license a project.
// While a plan is off, nothing it controls is gated. Stripe state lives in server-only
// entities; the browser only sees what `status` returns.
import { createClientFromRequest } from "npm:@base44/sdk";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Row = Record<string, any>;
type PlanKey = "pro" | "seller";
const items = (res: unknown): Row[] => (Array.isArray(res) ? res : (res as { items?: Row[] })?.items || []);
const okOrigin = (o: unknown): o is string => typeof o === "string" && /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.base44\.app$/i.test(o);

const CURRENCY = "aud";
const PLANS: Record<PlanKey, { name: string; description: string; amount: number; interval: string; interval_count: number }> = {
  pro: {
    name: "Handoff Pro",
    description: "Unlimited listings and code scans, 48-hour early access to new listings, listing insights.",
    amount: 850, // A$8.50
    interval: "month",
    interval_count: 1,
  },
  seller: {
    name: "Handoff seller licence",
    description: "Licence to sell and license projects on Handoff. Billed every 3 months.",
    amount: 5000, // A$50.00
    interval: "month",
    interval_count: 3,
  },
};
// AppConfig (key "billing") field names per plan. Pro keeps its original field names.
const FIELDS: Record<PlanKey, { enabled: string; launched: string; product: string; price: string; live: string; amount: string }> = {
  pro: { enabled: "pro_enabled", launched: "pro_launched_at", product: "stripe_product_id", price: "stripe_price_id", live: "stripe_livemode", amount: "price_amount" },
  seller: { enabled: "seller_enabled", launched: "seller_launched_at", product: "seller_product_id", price: "seller_price_id", live: "seller_livemode", amount: "seller_price_amount" },
};
const RULES = {
  free_active_listings: 2,
  free_scans_per_30d: 3,
  free_open_offers: 3,
  early_access_hours: 48,
  founding_count: 100,
  founding_free_months: 12,
  licence_deal_types: ["full_sale", "license"],
};
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);
const asPlan = (v: unknown): PlanKey => (v === "seller" ? "seller" : "pro");

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

// Rows saved before plans existed have no `plan` and count as Pro.
const subRow = async (db: any, userId: string, plan: PlanKey): Promise<Row | null> =>
  items(await db.Subscription.filter({ user_id: userId })).find((r) => asPlan(r.plan) === plan) || null;

async function saveSubscription(db: any, userId: string, plan: PlanKey, email: string, sub: Row, customerId: string) {
  const data = {
    user_id: userId,
    plan,
    email: email || "",
    stripe_customer_id: customerId || (typeof sub.customer === "string" ? sub.customer : sub.customer?.id) || "",
    stripe_subscription_id: sub.id || "",
    status: sub.status || "",
    current_period_end: periodEnd(sub),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    livemode: !!sub.livemode,
    checked_at: new Date().toISOString(),
  };
  const existing = await subRow(db, userId, plan);
  if (existing) await db.Subscription.update(existing.id, data); else await db.Subscription.create(data);
  return data;
}

// Re-check Stripe at most every 6h, or right away once the paid period has ended.
async function freshSubscription(db: any, userId: string, plan: PlanKey): Promise<Row | null> {
  const row = await subRow(db, userId, plan);
  if (!row?.stripe_subscription_id) return row;
  const stale = !row.checked_at || Date.now() - Date.parse(row.checked_at) > 6 * 3600_000 ||
    (row.current_period_end && Date.parse(row.current_period_end) < Date.now());
  if (!stale || !stripeKey()) return row;
  try {
    const sub = await stripe(`/subscriptions/${row.stripe_subscription_id}`);
    return { ...row, ...(await saveSubscription(db, userId, plan, row.email, sub, row.stripe_customer_id)) };
  } catch {
    return row;
  }
}

const subActive = (sub: Row | null) =>
  !!sub && PRO_STATUSES.has(sub.status) && (!sub.current_period_end || Date.parse(sub.current_period_end) > Date.now());

// Founding = one of the first 100 builder profiles ever created (server-side order, can't be self-claimed).
async function isFounding(db: any, userId: string): Promise<boolean> {
  const first = items(await db.BuilderProfile.filter({ user_id: { $exists: true } }, { sort: "created_date", limit: RULES.founding_count, fields: ["user_id"] }));
  return first.some((p) => p.user_id === userId);
}
function foundingEnds(launchedAt: string | undefined): string {
  if (!launchedAt) return "";
  const until = new Date(Date.parse(launchedAt));
  until.setMonth(until.getMonth() + RULES.founding_free_months);
  return until.getTime() > Date.now() ? until.toISOString() : "";
}

function priceInfo(billing: Row | null, plan: PlanKey) {
  const f = FIELDS[plan];
  return {
    amount: billing?.[f.amount] || PLANS[plan].amount,
    currency: CURRENCY.toUpperCase(),
    interval: PLANS[plan].interval,
    interval_count: PLANS[plan].interval_count,
  };
}

async function resolvePlan(db: any, me: Row | null, billing: Row | null) {
  const out: Row = {
    // Handoff Pro (top-level for compatibility)
    pro_enabled: !!billing?.pro_enabled,
    is_pro: false,
    source: null,
    pro_until: "",
    price: priceInfo(billing, "pro"),
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
    // Seller licence
    seller: {
      enabled: !!billing?.seller_enabled,
      licensed: false,
      source: null,
      until: "",
      price: priceInfo(billing, "seller"),
      checkout_ready: !!(billing?.seller_price_id && stripeKey()),
      subscription: null,
      deal_types: RULES.licence_deal_types,
    },
  };
  if (!me?.id) return out;

  const [proSub, sellerSub] = await Promise.all([freshSubscription(db, me.id, "pro"), freshSubscription(db, me.id, "seller")]);
  const view = (s: Row | null) => (s?.stripe_subscription_id ? { status: s.status, current_period_end: s.current_period_end, cancel_at_period_end: !!s.cancel_at_period_end } : null);
  out.subscription = view(proSub);
  out.seller.subscription = view(sellerSub);

  const proFoundingEnd = foundingEnds(billing?.pro_launched_at);
  const sellerFoundingEnd = foundingEnds(billing?.seller_launched_at);
  const founding = (proFoundingEnd || sellerFoundingEnd) ? await isFounding(db, me.id) : false;

  if (me.role === "admin") {
    out.is_pro = true; out.source = "admin";
  } else if (subActive(proSub)) {
    out.is_pro = true; out.source = "subscription"; out.pro_until = proSub!.current_period_end;
  } else if (founding && proFoundingEnd) {
    out.is_pro = true; out.source = "founding"; out.pro_until = proFoundingEnd;
  }

  if (me.role === "admin") {
    out.seller.licensed = true; out.seller.source = "admin";
  } else if (subActive(sellerSub)) {
    out.seller.licensed = true; out.seller.source = "subscription"; out.seller.until = sellerSub!.current_period_end;
  } else if (founding && sellerFoundingEnd) {
    out.seller.licensed = true; out.seller.source = "founding"; out.seller.until = sellerFoundingEnd;
  }

  if (out.pro_enabled && !out.is_pro) {
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
    const plan = asPlan(body.plan);
    const f = FIELDS[plan];
    const isAdmin = () => me?.role === "admin";
    const needUser = () => { if (!me?.id) throw new HttpError(401, "Sign in first."); };
    const needAdmin = () => { if (!isAdmin()) throw new HttpError(403, "Only an app admin can do that."); };
    let billing = await getBilling(db);

    if (action === "status") {
      return Response.json(await resolvePlan(db, me, billing));
    }

    // Public: is this builder a licensed seller right now? (shown as a trust badge, used by other functions)
    if (action === "seller_licence") {
      const userId = String(body.user_id || "");
      if (!userId) throw new HttpError(400, "user_id required");
      const enabled = !!billing?.seller_enabled;
      let role = "";
      try { role = (await db.User.get(userId))?.role || ""; } catch { role = ""; }
      let licensed = role === "admin";
      if (!licensed) licensed = subActive(await freshSubscription(db, userId, "seller"));
      if (!licensed && foundingEnds(billing?.seller_launched_at)) licensed = await isFounding(db, userId);
      return Response.json({ enabled, licensed });
    }

    // ---------- admin ----------
    if (action === "admin_status") {
      needAdmin();
      const live = stripeMode() === "live";
      const subs = items(await db.Subscription.filter({ status: { $in: [...PRO_STATUSES] } }, { limit: 1000 }))
        .filter((s) => s.livemode === live);
      const planView = (k: PlanKey) => ({
        enabled: !!billing?.[FIELDS[k].enabled],
        launched_at: billing?.[FIELDS[k].launched] || "",
        price_ready: !!billing?.[FIELDS[k].price],
        price_livemode: !!billing?.[FIELDS[k].live],
        price: priceInfo(billing, k),
        active_subscribers: subs.filter((s) => asPlan(s.plan) === k).length,
      });
      return Response.json({
        stripe_mode: stripeMode(),
        plans: { pro: planView("pro"), seller: planView("seller") },
        rules: RULES,
      });
    }

    if (action === "admin_setup_price") {
      needAdmin();
      const live = stripeMode() === "live";
      if (billing?.[f.price] && billing[f.live] === live && !body.force) {
        return Response.json({ ok: true, price_id: billing[f.price], reused: true });
      }
      const product = await stripe("/products", "POST", [["name", PLANS[plan].name], ["description", PLANS[plan].description]]);
      const price = await stripe("/prices", "POST", [
        ["product", product.id],
        ["unit_amount", String(PLANS[plan].amount)],
        ["currency", CURRENCY],
        ["recurring[interval]", PLANS[plan].interval],
        ["recurring[interval_count]", String(PLANS[plan].interval_count)],
        ["nickname", plan === "pro" ? "Handoff Pro monthly" : "Seller licence quarterly"],
      ]);
      const patch: Row = { [f.product]: product.id, [f.price]: price.id, [f.live]: !!price.livemode, [f.amount]: price.unit_amount };
      if (plan === "pro") patch.price_currency = price.currency;
      if (billing) await db.AppConfig.update(billing.id, patch); else billing = await db.AppConfig.create({ key: "billing", ...patch });
      return Response.json({ ok: true, price_id: price.id, livemode: !!price.livemode });
    }

    if (action === "admin_toggle") {
      needAdmin();
      const enabled = !!body.enabled;
      if (enabled && !billing?.[f.price]) throw new HttpError(409, "Create the price in Stripe first.");
      const patch: Row = { [f.enabled]: enabled };
      if (enabled && !billing?.[f.launched]) patch[f.launched] = new Date().toISOString();
      if (billing) await db.AppConfig.update(billing.id, patch); else await db.AppConfig.create({ key: "billing", ...patch });
      return Response.json({ ok: true, plan, enabled });
    }

    // ---------- members ----------
    if (action === "checkout") {
      needUser();
      // Admins can try a test-card checkout before launch; everyone else waits until the plan is on.
      if (!billing?.[f.enabled] && !(isAdmin() && stripeMode() === "test")) {
        throw new HttpError(409, plan === "pro" ? "Pro isn't switched on yet — everything is free right now." : "Seller licences aren't switched on yet — selling is free right now.");
      }
      if (!billing?.[f.price]) throw new HttpError(503, "Payments aren't set up yet.");
      const priceId = String(billing[f.price]);
      if (!okOrigin(body.origin)) throw new HttpError(400, "Bad origin");
      const current = await freshSubscription(db, me!.id, plan);
      if (subActive(current)) throw new HttpError(409, plan === "pro" ? "You already have a Pro subscription." : "You already have a seller licence.");
      // one Stripe customer per person, shared by both plans
      const rows = items(await db.Subscription.filter({ user_id: me!.id }));
      let customerId = rows.find((r) => r.stripe_customer_id)?.stripe_customer_id || "";
      if (customerId) {
        try { await stripe(`/customers/${customerId}`); } catch { customerId = ""; }
      }
      if (!customerId) {
        const customer = await stripe("/customers", "POST", [["email", me!.email || ""], ["metadata[user_id]", me!.id]]);
        customerId = customer.id;
      }
      if (current) await db.Subscription.update(current.id, { stripe_customer_id: customerId });
      else await db.Subscription.create({ user_id: me!.id, plan, email: me!.email || "", stripe_customer_id: customerId, status: "none" });
      const session = await stripe("/checkout/sessions", "POST", [
        ["mode", "subscription"],
        ["customer", customerId],
        ["client_reference_id", me!.id],
        ["line_items[0][price]", priceId],
        ["line_items[0][quantity]", "1"],
        ["metadata[plan]", plan],
        ["subscription_data[metadata][user_id]", me!.id],
        ["subscription_data[metadata][plan]", plan],
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
      const sessionPlan = asPlan(session.metadata?.plan);
      const sub = typeof session.subscription === "string" ? await stripe(`/subscriptions/${session.subscription}`) : session.subscription;
      await saveSubscription(db, me!.id, sessionPlan, me!.email || "", sub, typeof session.customer === "string" ? session.customer : session.customer?.id);
      return Response.json({ ...(await resolvePlan(db, me, billing)), confirmed_plan: sessionPlan });
    }

    if (action === "cancel" || action === "resume") {
      needUser();
      const row = await subRow(db, me!.id, plan);
      if (!row?.stripe_subscription_id) throw new HttpError(404, "No subscription found.");
      const sub = await stripe(`/subscriptions/${row.stripe_subscription_id}`, "POST", [["cancel_at_period_end", action === "cancel" ? "true" : "false"]]);
      await saveSubscription(db, me!.id, plan, row.email, sub, row.stripe_customer_id);
      return Response.json(await resolvePlan(db, me, billing));
    }

    throw new HttpError(400, "Unknown action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: (error as Error).message || "Billing request failed" }, { status });
  }
});
