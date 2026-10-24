import React from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatAmount, initials, timeAgo } from '@/lib/marketplace';
import { ArrowRight, Clock } from 'lucide-react';

const STATUS = {
  pending: { label: 'Waiting on a reply', pill: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30' },
  accepted: { label: 'Accepted — deal room open', pill: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30' },
  declined: { label: 'Declined', pill: 'bg-muted text-muted-foreground border-border' },
  countered: { label: 'Countered', pill: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30' },
  withdrawn: { label: 'Withdrawn', pill: 'bg-muted text-muted-foreground border-border' },
};

export default function OfferCard({ offer, user, onAccept, onDecline, onCounter, onWithdraw, busy }) {
  const status = STATUS[offer.status] || STATUS.pending;
  const iAmBuyer = offer.buyer_id === user?.id;
  const iAmSeller = offer.seller_id === user?.id;
  const isPending = offer.status === 'pending';
  // Whoever made an offer can only withdraw it; the other side accepts, counters or declines.
  const mine = offer.created_by_id ? offer.created_by_id === user?.id : iAmBuyer && !offer.parent_offer_id;
  const theirs = !mine && (iAmBuyer || iAmSeller);

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={offer.buyer_avatar} alt={offer.buyer_name} />
          <AvatarFallback className="bg-secondary text-[10px] font-semibold">{initials(offer.buyer_name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold">{formatAmount(offer.amount, offer.currency)}</span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.pill}`}>
              {status.label}
            </span>
            {offer.parent_offer_id && (
              <span className="text-xs text-muted-foreground">counter-offer</span>
            )}
          </div>

          <p className="text-xs font-medium text-muted-foreground">
            {mine ? 'Your offer' : iAmSeller ? offer.buyer_name || 'A builder' : 'Counter from the seller'}
            {offer.created_date && (
              <span className="ml-2 inline-flex items-center gap-1 font-normal">
                <Clock className="h-3 w-3" /> {timeAgo(offer.created_date)}
              </span>
            )}
          </p>

          {offer.message && <p className="text-sm text-muted-foreground">{offer.message}</p>}
          {offer.timeline && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Timeline:</span> {offer.timeline}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {isPending && mine && (
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => onWithdraw(offer)}>
                Withdraw
              </Button>
            )}
            {isPending && theirs && (
              <>
                <Button size="sm" className="rounded-full" disabled={busy} onClick={() => onAccept(offer)}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => onCounter(offer)}>
                  Counter
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={busy} onClick={() => onDecline(offer)}>
                  Decline
                </Button>
              </>
            )}
            {offer.status === 'accepted' && offer.deal_id && (
              <Button asChild size="sm" className="rounded-full">
                <Link to={`/deals/${offer.deal_id}`}>
                  Open deal room <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}