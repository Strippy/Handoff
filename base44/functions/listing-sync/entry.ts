import { createClientFromRequest } from "npm:@base44/sdk";

// Server-side listing writes.
//  - save / set_status: the only way to create a listing, change its deal type or its status.
//    Entity rules block these from the browser, so the seller licence and free-plan limits
//    can't be skipped.
//  - view / sync_deal: writes a non-owner legitimately triggers.
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
type Row = Record<string, any>;
const items = (res: unknown): Row[] => (Array.isArray(res) ? res : (res as { items?: Row[] })?.items || []);
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const list = (v: unknown, max: number, len = 80) =>
  Array.isArray(v) ? [...new Set(v.map((x) => clip(x, len)).filter(Boolean))].slice(0, max) : [];
const safeUrl = (v: unknown) => {
  const s = clip(v, 600);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? s : "";
  } catch {
    return "";
  }
};

const DEAL_TYPES = ["full_sale", "license", "collaborator", "finish_it", "free_adoption"];
const LICENCE_DEAL_TYPES = ["full_sale", "license"];
const STAGES = ["idea", "prototype", "mvp", "live", "earning"];
const CATEGORIES = ["web_app", "mobile_app", "saas", "game", "website", "script_tool", "extension", "template", "api", "ai_agent", "other"];
const CURRENCIES = ["AUD", "USD", "EUR", "GBP"];
const pick = (v: unknown, allowed: string[], fallback: string) => (allowed.includes(String(v)) ? String(v) : fallback);

// Only these fields can come from the browser. Status, seller, views and scan fields are server-owned.
function cleanListing(d: Row) {
  const gallery = Array.isArray(d.gallery)
    ? d.gallery
        .map((g: Row) => ({ url: safeUrl(g?.url), type: g?.type === "video" ? "video" : "image", caption: clip(g?.caption, 200) }))
        .filter((g: Row) => g.url)
        .slice(0, 20)
    : [];
  const price = Number(d.price);
  return {
    title: clip(d.title, 120),
    tagline: clip(d.tagline, 160),
    category: pick(d.category, CATEGORIES, "other"),
    stage: pick(d.stage, STAGES, "idea"),
    deal_type: pick(d.deal_type, DEAL_TYPES, "full_sale"),
    price: Number.isFinite(price) && price > 0 ? Math.min(Math.round(price * 100) / 100, 100_000_000) : 0,
    currency: pick(d.currency, CURRENCIES, "USD"),
    open_to_offers: d.open_to_offers !== false,
    description: clip(d.description, 8000),
    ai_tools: list(d.ai_tools, 20),
    tech_stack: list(d.tech_stack, 40),
    what_works: clip(d.what_works, 4000),
    known_issues: clip(d.known_issues, 4000),
    included: list(d.included, 30, 200),
    monthly_costs: clip(d.monthly_costs, 500),
    reported_users: clip(d.reported_users, 200),
    reported_revenue: clip(d.reported_revenue, 200),
    demo_url: safeUrl(d.demo_url),
    feedback_wanted: !!d.feedback_wanted,
    cover_image: safeUrl(d.cover_image),
    gallery,
    tags: list(d.tags, 12, 40),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const { action, listing_id, deal_id } = body;

    let me: Row | null = null;
    try {
      me = await base44.auth.me();
    } catch (_) {
      me = null;
    }

    if (action === "view") {
      if (!listing_id) throw new HttpError(400, "listing_id required");
      const listing = await db.Listing.get(listing_id);
      if (!listing) throw new HttpError(404, "Listing not found");
      // The seller looking at their own page is not a real view.
      if (me?.id && me.id === listing.seller_id) return Response.json({ views: listing.views || 0, counted: false });
      const views = (listing.views || 0) + 1;
      await db.Listing.update(listing_id, { views });
      return Response.json({ views, counted: true });
    }

    if (!me?.id) throw new HttpError(401, "Sign in required");
    const isAdmin = me.role === "admin";

    // Plan checks only run when that plan is switched on.
    const billing = items(await db.AppConfig.filter({ key: "billing" }))[0] || null;
    let planCache: Row | null = null;
    const myPlan = async () => {
      if (planCache) return planCache;
      try {
        planCache = (await base44.functions.invoke("billing", { action: "status" }))?.data ?? null;
      } catch {
        planCache = null;
      }
      if (!planCache) throw new HttpError(503, "Couldn't check your plan — try again in a minute.");
      return planCache;
    };
    const needLicence = async (dealType: string) => {
      if (!billing?.seller_enabled || !LICENCE_DEAL_TYPES.includes(dealType)) return;
      const plan = await myPlan();
      if (!plan.seller?.licensed) {
        throw new HttpError(402, "Selling or licensing a project needs a seller licence (A$50 every 3 months). Collabs, finishing jobs and free adoptions don't.");
      }
    };
    const needListingRoom = async () => {
      if (!billing?.pro_enabled) return;
      const plan = await myPlan();
      if (plan.is_pro) return;
      const cap = plan.limits?.active_listings ?? 2;
      if ((plan.usage?.active_listings ?? 0) >= cap) {
        throw new HttpError(402, `The free plan allows ${cap} active listings. Archive one, or go Pro or get a seller licence for unlimited listings.`);
      }
    };

    if (action === "save") {
      const data = cleanListing(body.data || {});
      if (!data.title) throw new HttpError(400, "Give your project a title first.");
      if (!data.cover_image) throw new HttpError(400, "Add a cover image — it is the first thing people see on the card.");
      if (["live", "earning"].includes(data.stage) && !data.demo_url) throw new HttpError(400, "Live and earning projects need a demo link so buyers can see it running.");

      if (listing_id) {
        const existing = await db.Listing.get(String(listing_id)).catch(() => null);
        if (!existing) throw new HttpError(404, "Listing not found");
        if (existing.seller_id !== me.id && !isAdmin) throw new HttpError(403, "Only the builder who listed a project can edit it.");
        if (existing.status === "reserved" && data.deal_type !== existing.deal_type) {
          throw new HttpError(409, "There's a deal in progress — the deal type can't change until it's done.");
        }
        if (data.deal_type !== existing.deal_type && existing.status === "active") await needLicence(data.deal_type);
        const saved = await db.Listing.update(existing.id, data);
        return Response.json({ listing: saved });
      }

      if (body.attested !== true) throw new HttpError(400, "Tick the ownership box — only list what is yours to sell or share.");
      await needLicence(data.deal_type);
      await needListingRoom();
      const profile = items(await db.BuilderProfile.filter({ user_id: me.id }, { limit: 1 }))[0];
      const saved = await db.Listing.create({
        ...data,
        status: "active",
        views: 0,
        seller_id: me.id,
        seller_name: profile?.display_name || me.full_name || "Builder",
        seller_avatar: profile?.avatar_url || "",
        ownership_attested_at: new Date().toISOString(),
      });
      return Response.json({ listing: saved });
    }

    if (action === "set_status") {
      const listing = await db.Listing.get(String(listing_id || "")).catch(() => null);
      if (!listing) throw new HttpError(404, "Listing not found");
      if (listing.seller_id !== me.id && !isAdmin) throw new HttpError(403, "Only the builder who listed a project can change it.");
      const next = String(body.status || "");
      if (!["active", "archived", "sold"].includes(next)) throw new HttpError(400, "Bad status");
      if (listing.status === next) return Response.json({ listing });
      if (listing.status === "reserved" && !isAdmin) {
        throw new HttpError(409, "There's a deal in progress — finish or cancel it in the Deal Room first.");
      }
      if (next === "active") {
        if (listing.status === "sold" && !isAdmin) throw new HttpError(409, "A sold listing can't go back on the market. List it again as a new project.");
        await needLicence(listing.deal_type);
        await needListingRoom();
      }
      const saved = await db.Listing.update(listing.id, { status: next });
      return Response.json({ listing: saved });
    }

    if (action === "sync_deal") {
      // Kept for older clients; the deal-room function now moves listing status itself.
      if (!deal_id) throw new HttpError(400, "deal_id required");
      const deal = await db.Deal.get(deal_id);
      if (!deal) throw new HttpError(404, "Deal not found");
      if (deal.buyer_id !== me.id && deal.seller_id !== me.id) throw new HttpError(403, "Not a party to this deal");
      const listing = await db.Listing.get(deal.listing_id);
      if (!listing) throw new HttpError(404, "Listing not found");
      let next: string | null = null;
      if (deal.status === "completed" && deal.sold && deal.buyer_confirmed) next = "sold";
      if (deal.status === "cancelled" && listing.status === "reserved") next = "active";
      if (!next || next === listing.status) return Response.json({ ok: true, status: listing.status });
      await db.Listing.update(deal.listing_id, { status: next });
      return Response.json({ ok: true, status: next });
    }

    throw new HttpError(400, "Unknown action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
});
