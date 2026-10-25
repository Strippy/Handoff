// Deal Room state machine. Deals, reviews and the steps between them are written
// only here (entity RLS denies client writes), so neither side can tick the other's
// boxes, skip steps, fake a completed deal, or post a review without one.
//
// Order:  agree terms → money in escrow → code delivered (recorded by scan-project)
//         → buyer marks received (inspection window starts) → buyer confirms
//         → seller confirms keys rotated → sold.
// Every step lands in an append-only log with timestamps: the evidence Escrow.com
// asks for if a buyer rejects after receiving the code.
import { createClientFromRequest } from "npm:@base44/sdk";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
type Row = Record<string, any>;
const items = (res: unknown): Row[] => (Array.isArray(res) ? res : (res as { items?: Row[] })?.items || []);
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const now = () => new Date().toISOString();

const LICENCE_DEAL_TYPES = ["full_sale", "license"];
const isEscrowUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /^(?:[a-z0-9-]+\.)*escrow\.com$/i.test(x.hostname);
  } catch {
    return false;
  }
};

async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const termsDigest = (deal: Row, terms: Row) =>
  sha256Hex(JSON.stringify({
    listing_id: deal.listing_id, amount: deal.amount, currency: deal.currency,
    included: terms.included, criteria: terms.criteria, inspection_days: terms.inspection_days,
  }));

const withLog = (deal: Row, by: string, event: string) =>
  [...(Array.isArray(deal.log) ? deal.log : []), { at: now(), by, event: clip(event, 300) }].slice(-200);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    let me: Row | null = null;
    try { me = await base44.auth.me(); } catch { me = null; }
    const body = await req.json().catch(() => ({}));
    if (!me?.id) throw new HttpError(401, "Sign in first.");
    const action = String(body.action || "");
    const isAdmin = me.role === "admin";

    // ---------- accept an offer → open a deal ----------
    if (action === "accept_offer") {
      const offer = await db.Offer.get(String(body.offer_id || "")).catch(() => null);
      if (!offer) throw new HttpError(404, "Offer not found.");
      if (offer.status !== "pending") throw new HttpError(409, "That offer isn't open any more.");
      const listing = await db.Listing.get(offer.listing_id).catch(() => null);
      if (!listing) throw new HttpError(404, "Listing not found.");
      if (offer.seller_id !== listing.seller_id) throw new HttpError(409, "That offer doesn't match this listing.");
      const iAmSeller = me.id === listing.seller_id;
      const iAmBuyer = me.id === offer.buyer_id;
      if (!iAmSeller && !iAmBuyer) throw new HttpError(403, "Only the buyer and seller can accept this offer.");
      if (offer.created_by_id === me.id) throw new HttpError(403, "You can't accept your own offer — the other side has to.");
      // the amount on screen must be the amount in the record
      if (body.expected_amount != null && Number(body.expected_amount) !== Number(offer.amount)) {
        throw new HttpError(409, "This offer changed since you opened it. Refresh and check it again.");
      }
      if (listing.status !== "active") throw new HttpError(409, "This listing isn't taking deals right now.");
      const openDeals = items(await db.Deal.filter({ listing_id: listing.id, status: "open" }, { limit: 1 }));
      if (openDeals.length) throw new HttpError(409, "There's already a deal in progress on this listing.");
      if (LICENCE_DEAL_TYPES.includes(listing.deal_type)) {
        let lic: Row | null = null;
        try { lic = (await base44.functions.invoke("billing", { action: "seller_licence", user_id: listing.seller_id }))?.data ?? null; } catch { lic = null; }
        if (!lic) throw new HttpError(503, "Couldn't check the seller licence — try again in a minute.");
        if (lic.enabled && !lic.licensed) {
          throw new HttpError(402, iAmSeller
            ? "Your seller licence has lapsed. Renew it to accept offers."
            : "This seller's licence has lapsed, so they can't take a deal right now.");
        }
      }
      const by = iAmSeller ? "seller" : "buyer";
      const deal = await db.Deal.create({
        listing_id: listing.id,
        listing_title: listing.title || "",
        listing_cover: listing.cover_image || "",
        offer_id: offer.id,
        deal_type: listing.deal_type || "",
        buyer_id: offer.buyer_id,
        buyer_name: offer.buyer_name || "",
        seller_id: listing.seller_id,
        seller_name: listing.seller_name || "",
        amount: Number(offer.amount) || 0,
        currency: offer.currency || listing.currency || "USD",
        handover_notes: "",
        status: "open",
        terms: { included: (listing.included || []).slice(0, 30), criteria: "", inspection_days: 3 },
        log: [{ at: now(), by, event: `Offer accepted at ${offer.amount} ${offer.currency || ""}`.trim() }],
      });
      await db.Offer.update(offer.id, { status: "accepted", deal_id: deal.id });
      const others = items(await db.Offer.filter({ listing_id: listing.id, status: "pending" }, { limit: 200 }));
      for (const o of others) if (o.id !== offer.id) await db.Offer.update(o.id, { status: "declined" });
      await db.Listing.update(listing.id, { status: "reserved" });
      return Response.json({ deal });
    }

    // ---------- everything else acts on an existing deal ----------
    const deal = await db.Deal.get(String(body.deal_id || "")).catch(() => null);
    if (!deal) throw new HttpError(404, "Deal not found.");
    const role = me.id === deal.seller_id ? "seller" : me.id === deal.buyer_id ? "buyer" : isAdmin ? "admin" : "";
    if (!role) throw new HttpError(403, "Only the buyer and seller can do that.");
    const needRole = (r: string) => { if (role !== r) throw new HttpError(403, `Only the ${r} can do that.`); };
    const needOpen = () => { if (deal.status !== "open") throw new HttpError(409, "This deal is closed."); };
    const bothAgreed = !!(deal.terms_hash && deal.terms_agreed_buyer_at && deal.terms_agreed_seller_at);
    const save = async (patch: Row, event: string) => {
      const updated = await db.Deal.update(deal.id, { ...patch, log: withLog(deal, role, event) });
      return Response.json({ deal: updated });
    };

    if (action === "set_terms") {
      needRole("seller"); needOpen();
      if (deal.escrow_set) throw new HttpError(409, "The terms are locked once money is in escrow.");
      const criteria = clip(body.criteria, 3000);
      if (criteria.length < 20) throw new HttpError(400, "Spell out how the buyer will check it works — at least a sentence or two.");
      const included = (Array.isArray(body.included) ? body.included : []).map((x: unknown) => clip(x, 200)).filter(Boolean).slice(0, 30);
      const days = Math.round(Number(body.inspection_days));
      if (!(days >= 1 && days <= 30)) throw new HttpError(400, "Inspection period must be 1–30 days (the range Escrow.com allows).");
      const terms = { included, criteria, inspection_days: days };
      const hash = await termsDigest(deal, terms);
      if (hash === deal.terms_hash) return Response.json({ deal });
      return save({ terms, terms_hash: hash, terms_set_at: now(), terms_agreed_buyer_at: "", terms_agreed_seller_at: "" }, "Handover terms written (both sides need to agree again)");
    }

    if (action === "agree_terms") {
      needOpen();
      if (role === "admin") throw new HttpError(403, "Only the buyer and seller can agree terms.");
      if (!deal.terms_hash || !deal.terms?.criteria) throw new HttpError(409, "The seller hasn't written the handover terms yet.");
      if (String(body.terms_hash || "") !== deal.terms_hash) throw new HttpError(409, "The terms changed since you read them. Read them again, then agree.");
      const field = role === "buyer" ? "terms_agreed_buyer_at" : "terms_agreed_seller_at";
      if (deal[field]) return Response.json({ deal });
      return save({ [field]: now() }, `Agreed to handover terms ${deal.terms_hash.slice(0, 12)}`);
    }

    if (action === "escrow") {
      needRole("seller"); needOpen();
      if (!bothAgreed) throw new HttpError(409, "Agree the handover terms together before opening escrow.");
      const url = clip(body.url, 500);
      if (!isEscrowUrl(url)) throw new HttpError(400, "That isn't an Escrow.com link. Only use a transaction on https://www.escrow.com — never a payment link someone sends you.");
      return save({ escrow_url: url }, "Escrow.com transaction linked");
    }

    if (action === "step") {
      needOpen();
      const key = String(body.key || "");
      const value = !!body.value;
      if (key === "escrow_set") {
        needRole("seller");
        if (value && !bothAgreed) throw new HttpError(409, "Agree the handover terms first.");
        if (value && !isEscrowUrl(deal.escrow_url || "")) throw new HttpError(409, "Link the Escrow.com transaction first.");
        if (!value && deal.delivery) throw new HttpError(409, "The code is already delivered — this can't be undone.");
        return save({ escrow_set: value }, value ? "Seller confirmed the buyer's money is in escrow" : "Seller un-ticked escrow");
      }
      if (key === "asset_transfer") {
        needRole("seller");
        if (value && !deal.escrow_set) throw new HttpError(409, "Wait until the money is in escrow.");
        if (!value && deal.buyer_confirmed) throw new HttpError(409, "The buyer has already confirmed — this can't be undone.");
        return save({ asset_transfer: value }, value ? "Seller handed over assets and accounts" : "Seller un-ticked assets");
      }
      if (key === "keys_rotated") {
        needRole("seller");
        return save({ keys_rotated: value }, value ? "Seller confirmed every key and password from the project has been revoked or rotated" : "Seller un-ticked key rotation");
      }
      if (key === "buyer_confirmed") {
        needRole("buyer");
        if (value && !deal.received_at) throw new HttpError(409, "Mark the code as received first.");
        if (!value && deal.sold) throw new HttpError(409, "The deal is already closed.");
        return save({ buyer_confirmed: value }, value ? "Buyer confirmed it works as agreed" : "Buyer withdrew confirmation");
      }
      if (key === "sold") {
        needRole("seller");
        if (!value) throw new HttpError(409, "A sale can't be un-done here.");
        if (!deal.buyer_confirmed) throw new HttpError(409, "The buyer needs to confirm first.");
        if (deal.dispute?.open) throw new HttpError(409, "There's an open problem on this deal — sort it out first.");
        if (!deal.keys_rotated) throw new HttpError(409, "Confirm you've revoked or rotated every key and password first.");
        const updated = await db.Deal.update(deal.id, { sold: true, status: "completed", completed_at: now(), log: withLog(deal, role, "Seller marked the deal complete") });
        try { await db.Listing.update(deal.listing_id, { status: "sold" }); } catch { /* listing removed */ }
        return Response.json({ deal: updated });
      }
      throw new HttpError(400, "Unknown step");
    }

    if (action === "received") {
      needRole("buyer"); needOpen();
      if (!deal.delivery) throw new HttpError(409, "Nothing has been delivered yet.");
      if (deal.received_at) return Response.json({ deal });
      const days = Number(deal.terms?.inspection_days) || 3;
      const ends = new Date(Date.now() + days * 86400_000).toISOString();
      return save({ received_at: now(), inspection_ends_at: ends }, `Buyer marked the code received — ${days}-day inspection started`);
    }

    if (action === "delivery_link") {
      needOpen();
      const uri = deal.delivery?.file_uri;
      if (!uri) throw new HttpError(404, "There's no delivered zip on this deal.");
      const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 600 });
      await db.Deal.update(deal.id, { log: withLog(deal, role, `${role === "buyer" ? "Buyer" : "Seller"} downloaded the delivered zip`) });
      return Response.json({ url: signed_url });
    }

    if (action === "notes") {
      needOpen();
      return save({ handover_notes: clip(body.notes, 4000) }, "Handover notes edited");
    }

    if (action === "dispute") {
      needOpen();
      if (role === "admin") throw new HttpError(403, "Only the buyer and seller can raise a problem.");
      if (deal.dispute?.open) throw new HttpError(409, "There's already an open problem on this deal.");
      if (role === "buyer" && !deal.received_at) throw new HttpError(409, "You haven't received anything yet — you can still cancel instead.");
      if (role === "seller" && !deal.escrow_set) throw new HttpError(409, "Nothing's in escrow yet — you can still cancel instead.");
      const criterion = clip(body.criterion, 500);
      const details = clip(body.details, 3000);
      if (role === "buyer" && !criterion) throw new HttpError(400, "Say which agreed criterion isn't met.");
      if (details.length < 20) throw new HttpError(400, "Explain what's wrong in a sentence or two.");
      const dispute = { open: true, raised_by: role, criterion, details, at: now() };
      try {
        await db.Report.create({
          reporter_id: me.id, reporter_name: role, target_type: "deal", target_id: deal.id,
          target_label: deal.listing_title || "", reason: "Deal problem",
          details: `${criterion ? `Criterion: ${criterion}\n` : ""}${details}`, status: "open",
        });
      } catch { /* admin queue is best-effort */ }
      return save({ dispute }, `${role === "buyer" ? "Buyer" : "Seller"} raised a problem${criterion ? `: ${criterion}` : ""}`);
    }

    if (action === "resolve_dispute") {
      if (!deal.dispute?.open) return Response.json({ deal });
      if (role !== deal.dispute.raised_by && role !== "admin") throw new HttpError(403, "Only whoever raised it (or an admin) can close it.");
      return save({ dispute: { ...deal.dispute, open: false, resolved_at: now() } }, "Problem marked resolved");
    }

    if (action === "cancel") {
      needOpen();
      if (role === "buyer" && deal.delivery) {
        throw new HttpError(409, "The code has already been delivered, so the deal can't just be cancelled. If something's wrong, raise a problem against the agreed terms — refunds go through Escrow.com.");
      }
      const updated = await db.Deal.update(deal.id, { status: "cancelled", cancelled_by: role, log: withLog(deal, role, `${role} cancelled the deal`) });
      try {
        const listing = await db.Listing.get(deal.listing_id);
        if (listing?.status === "reserved") await db.Listing.update(deal.listing_id, { status: "active" });
      } catch { /* listing removed */ }
      return Response.json({ deal: updated });
    }

    if (action === "review") {
      if (role === "admin") throw new HttpError(403, "Only the buyer and seller can review this deal.");
      if (deal.status !== "completed") throw new HttpError(409, "Reviews open once the deal is complete.");
      const rating = Math.round(Number(body.rating));
      if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, "Pick 1 to 5 stars.");
      const existing = items(await db.Review.filter({ deal_id: deal.id, reviewer_id: me.id }, { limit: 1 }));
      if (existing.length) throw new HttpError(409, "You've already reviewed this deal.");
      const profile = items(await db.BuilderProfile.filter({ user_id: me.id }, { limit: 1 }))[0];
      const review = await db.Review.create({
        deal_id: deal.id,
        listing_id: deal.listing_id,
        listing_title: deal.listing_title || "",
        reviewer_id: me.id,
        reviewer_name: profile?.display_name || me.full_name || "A builder",
        reviewer_avatar: profile?.avatar_url || "",
        reviewer_role: role,
        reviewee_id: role === "buyer" ? deal.seller_id : deal.buyer_id,
        rating,
        body: clip(body.body, 2000),
      });
      return Response.json({ review });
    }

    throw new HttpError(400, "Unknown action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: (error as Error).message || "Deal request failed" }, { status });
  }
});
