import { createClientFromRequest } from "npm:@base44/sdk";

// Server-side listing writes that a non-owner legitimately triggers.
// Listing RLS only lets the owner (or an admin) update a listing, so view counts
// and deal-driven status changes go through here with the service role, after
// checking the caller is allowed to cause them.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, listing_id, deal_id } = await req.json();

    let me: { id?: string } | null = null;
    try {
      me = await base44.auth.me();
    } catch (_) {
      me = null;
    }

    if (action === "view") {
      if (!listing_id) return Response.json({ error: "listing_id required" }, { status: 400 });
      const listing = await base44.asServiceRole.entities.Listing.get(listing_id);
      if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });
      // The seller looking at their own page is not a real view.
      if (me?.id && me.id === listing.seller_id) {
        return Response.json({ views: listing.views || 0, counted: false });
      }
      const views = (listing.views || 0) + 1;
      await base44.asServiceRole.entities.Listing.update(listing_id, { views });
      return Response.json({ views, counted: true });
    }

    if (action === "sync_deal") {
      if (!me?.id) return Response.json({ error: "Sign in required" }, { status: 401 });
      if (!deal_id) return Response.json({ error: "deal_id required" }, { status: 400 });
      const deal = await base44.asServiceRole.entities.Deal.get(deal_id);
      if (!deal) return Response.json({ error: "Deal not found" }, { status: 404 });
      if (deal.buyer_id !== me.id && deal.seller_id !== me.id) {
        return Response.json({ error: "Not a party to this deal" }, { status: 403 });
      }
      const listing = await base44.asServiceRole.entities.Listing.get(deal.listing_id);
      if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });

      let next: string | null = null;
      // Sold only once the seller has ticked the final step after buyer confirmation.
      if (deal.status === "completed" && deal.sold && deal.buyer_confirmed) next = "sold";
      // A cancelled deal frees the listing, but never overrides a seller's own archive/sold choice.
      if (deal.status === "cancelled" && listing.status === "reserved") next = "active";

      if (!next || next === listing.status) return Response.json({ ok: true, status: listing.status });
      await base44.asServiceRole.entities.Listing.update(deal.listing_id, { status: next });
      return Response.json({ ok: true, status: next });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
