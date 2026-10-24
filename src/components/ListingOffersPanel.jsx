import React from 'react';
import { Link } from 'react-router-dom';
import OfferCard from '@/components/OfferCard';
import { formatAmount } from '@/lib/marketplace';
import { ArrowRight, Users } from 'lucide-react';

export default function ListingOffersPanel({
  listing,
  user,
  offers,
  deals,
  iAmSeller,
  busy,
  onAccept,
  onDecline,
  onWithdraw,
  onCounter,
}) {
  if (!offers.length && !deals.length) return null;

  return (
    <div className="space-y-6">
      {deals.length > 0 && (
        <div className="card-soft space-y-3 p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {iAmSeller ? 'Offers in motion' : 'Your deals on this project'}
          </h2>
          {deals.map((deal) => (
            <Link
              key={deal.id}
              to={`/deals/${deal.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/60 p-4 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="text-sm font-semibold">
                  {iAmSeller ? deal.buyer_name : deal.seller_name} · {formatAmount(deal.amount, deal.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {deal.status === 'completed'
                    ? 'Completed'
                    : deal.status === 'cancelled'
                      ? 'Cancelled'
                      : 'Handover pack in progress'}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {offers.length > 0 && (
        <div className="card-soft space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {iAmSeller ? `Offers (${offers.length})` : 'Your offers'}
            </h2>
          </div>
          <div className="space-y-3">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                user={user}
                busy={busy}
                onAccept={onAccept}
                onDecline={onDecline}
                onWithdraw={onWithdraw}
                onCounter={onCounter}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}