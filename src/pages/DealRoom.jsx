import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, formatAmount, loadMyProfile, pushNotification } from '@/lib/marketplace';
import { Image } from '@/components/ui/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import DealChecklist from '@/components/DealChecklist';
import ReviewForm from '@/components/ReviewForm';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/ui/use-toast';
import { initials } from '@/lib/marketplace';
import { Loader2, ShieldAlert } from 'lucide-react';

export default function DealRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [deal, setDeal] = useState(null);
  const [profile, setProfile] = useState(null);
  const [myReview, setMyReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const [found, p] = await Promise.all([
        base44.entities.Deal.get(id),
        loadMyProfile(user.id),
      ]);
      if (!active) return;
      setDeal(found);
      setProfile(p);
      const reviewRes = await base44.entities.Review.filter({ deal_id: id, reviewer_id: user.id }, { limit: 1 });
      if (!active) return;
      setMyReview(asItems(reviewRes)[0] || null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id]);

  const myName = profile?.display_name || user?.full_name || 'Builder';

  const notifyCounterparty = (dealRecord, title, body) => {
    const target = dealRecord.buyer_id === user.id ? dealRecord.seller_id : dealRecord.buyer_id;
    pushNotification({
      user_id: target,
      type: 'deal',
      title,
      body,
      link: `/deals/${dealRecord.id}`,
      actor_name: myName,
      actor_avatar: profile?.avatar_url || '',
      read: false,
    });
  };

  const updateDeal = async (patch, notification) => {
    setBusy(true);
    const updated = await base44.entities.Deal.update(deal.id, patch);
    setDeal(updated);
    if (updated.status === 'completed' || updated.status === 'cancelled') {
      // Listing writes are owner-only under RLS; the server checks we're a party and syncs status.
      await base44.functions.invoke('listing-sync', { action: 'sync_deal', deal_id: updated.id }).catch(() => {});
    }
    if (notification) notifyCounterparty(updated, notification.title, notification.body);
    setBusy(false);
  };

  const toggleStep = (key, value) => {
    const patch = { [key]: value };
    if (key === 'sold' && value) patch.status = 'completed';
    const label = value ? 'ticked off' : 'un-ticked';
    updateDeal(patch, {
      title: `Deal update on ${deal.listing_title}`,
      body: `${myName} ${label} a handover step.`,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!deal) {
    return <EmptyState icon={ShieldAlert} title="Deal not found" body="It may have been cancelled or removed." />;
  }

  const iAmParty = deal.buyer_id === user.id || deal.seller_id === user.id;
  if (!iAmParty) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="This deal isn't yours"
        body="Only the buyer and seller in a deal can open its room."
      />
    );
  }

  const iAmBuyer = deal.buyer_id === user.id;
  const counterpartyName = iAmBuyer ? deal.seller_name : deal.buyer_name;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/deals" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← All my deals
        </Link>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">Deal room</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {iAmBuyer ? 'You are buying from' : 'You are selling to'} {counterpartyName} ·{' '}
          {formatAmount(deal.amount, deal.currency)}
        </p>
      </div>

      {deal.status === 'cancelled' && (
        <div className="rounded-3xl border border-border bg-secondary/60 p-5">
          <p className="font-display text-sm font-semibold">This deal was cancelled</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The listing is back on the market. Nothing was lost — you can agree new terms any time.
          </p>
        </div>
      )}

      {deal.status === 'completed' && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="font-display text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Handover complete — the listing is marked sold
          </p>
          <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-200/80">
            Both of you can now leave a review. That's the only way reviews exist here.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <DealChecklist
            deal={deal}
            user={user}
            busy={busy || deal.status === 'cancelled'}
            onToggle={toggleStep}
            onSaveEscrow={(escrow_url) => updateDeal({ escrow_url })}
            onSaveNotes={(handover_notes) => updateDeal({ handover_notes })}
          />

          {deal.status === 'completed' && !myReview && (
            <ReviewForm
              deal={deal}
              user={user}
              profile={profile}
              onSubmitted={(review) => {
                setMyReview(review);
                toast({ title: 'Review posted', description: 'Thanks for keeping this place trustworthy.' });
              }}
            />
          )}

          {myReview && (
            <div className="card-soft p-5">
              <p className="text-sm font-semibold">You reviewed this deal</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {myReview.rating}/5 — thanks, that helps the next person.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="card-soft space-y-4 p-5">
            <div className="h-28 w-full overflow-hidden rounded-2xl bg-muted">
              {deal.listing_cover ? (
                <Image src={deal.listing_cover} alt={deal.listing_title} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div>
              <Link to={`/listing/${deal.listing_id}`} className="font-display text-sm font-semibold hover:text-primary">
                {deal.listing_title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                Agreed at {formatAmount(deal.amount, deal.currency)}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/60 p-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                  {initials(counterpartyName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-semibold">{counterpartyName}</p>
                <p className="text-[11px] text-muted-foreground">{iAmBuyer ? 'Seller' : 'Buyer'}</p>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full rounded-full">
              <Link to={`/messages`}>Talk it through in chat</Link>
            </Button>
            {deal.status === 'open' && (
              <Button
                variant="ghost"
                className="w-full rounded-full text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() =>
                  updateDeal(
                    { status: 'cancelled' },
                    { title: 'A deal was cancelled', body: `${myName} cancelled the deal for ${deal.listing_title}.` }
                  )
                }
              >
                Cancel this deal
              </Button>
            )}
          </div>

          <div className="card-soft space-y-2 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Staying safe</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Handoff never touches the money. Keep payment inside the Escrow.com transaction, hand over the code last,
              and confirm only once you've run the project yourself.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}