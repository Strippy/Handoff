import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, formatAmount, initials, loadMyProfile, pushNotification } from '@/lib/marketplace';
import { Image } from '@/components/ui/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import DealChecklist from '@/components/DealChecklist';
import ReviewForm from '@/components/ReviewForm';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/ui/use-toast';
import { ClipboardCopy, History, Loader2, ShieldAlert } from 'lucide-react';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Plain-text record of the deal — what Escrow.com asks for if there's a dispute. */
function evidenceText(deal) {
  const t = deal.terms || {};
  const d = deal.delivery;
  const lines = [
    `Handoff deal record — ${deal.listing_title}`,
    `Deal ${deal.id} · status ${deal.status}`,
    `Buyer: ${deal.buyer_name || deal.buyer_id} · Seller: ${deal.seller_name || deal.seller_id}`,
    `Agreed price: ${formatAmount(deal.amount, deal.currency)}`,
    '',
    `Handover terms (fingerprint ${deal.terms_hash || 'none'})`,
    `  Included: ${(t.included || []).join('; ') || '—'}`,
    `  How the buyer checks it works:`,
    ...String(t.criteria || '—').split('\n').map((l) => `    ${l}`),
    `  Inspection period: ${t.inspection_days || '—'} days`,
    `  Agreed by seller: ${fmt(deal.terms_agreed_seller_at)} · by buyer: ${fmt(deal.terms_agreed_buyer_at)}`,
    '',
    `Escrow.com transaction: ${deal.escrow_url || '—'}`,
    d
      ? `Delivered ${fmt(d.at)}: ${d.method === 'zip' ? `zip ${d.label}, sha256 ${d.sha256}, ${d.bytes} bytes` : `repo ${d.repo}, commit ${d.commit}`}; ${d.file_count} files, ${d.lines_of_code} lines, readiness score ${d.score}${d.listing_scan ? ` (listing scan ${d.listing_scan.score}, ${d.listing_scan.file_count} files)` : ''}`
      : 'Delivered: not yet',
    `Buyer marked received: ${fmt(deal.received_at)} · inspection ends ${fmt(deal.inspection_ends_at)}`,
    `Accounts handed over: ${deal.asset_transfer ? 'yes' : 'no'} · keys rotated: ${deal.keys_rotated ? 'yes' : 'no'} · buyer confirmed: ${deal.buyer_confirmed ? 'yes' : 'no'}`,
    deal.dispute ? `Problem raised by ${deal.dispute.raised_by} ${fmt(deal.dispute.at)}: ${deal.dispute.criterion ? `[${deal.dispute.criterion}] ` : ''}${deal.dispute.details}${deal.dispute.open ? '' : ` (resolved ${fmt(deal.dispute.resolved_at)})`}` : '',
    '',
    'Timeline (recorded by Handoff\'s server):',
    ...(deal.log || []).map((e) => `  ${e.at} — ${e.by}: ${e.event}`),
  ];
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}

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
      const [found, p] = await Promise.all([api.entities.Deal.get(id).catch(() => null), loadMyProfile(user.id)]);
      if (!active) return;
      setDeal(found);
      setProfile(p);
      const reviewRes = await api.entities.Review.filter({ deal_id: id, reviewer_id: user.id }, { limit: 1 });
      if (!active) return;
      setMyReview(asItems(reviewRes)[0] || null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id]);

  const myName = profile?.display_name || user?.full_name || 'Builder';

  const notifyCounterparty = (dealRecord, body) => {
    const target = dealRecord.buyer_id === user.id ? dealRecord.seller_id : dealRecord.buyer_id;
    pushNotification({
      user_id: target,
      type: 'deal',
      title: `Deal update on ${dealRecord.listing_title}`,
      body,
      link: `/deals/${dealRecord.id}`,
      actor_name: myName,
      actor_avatar: profile?.avatar_url || '',
      read: false,
    });
  };

  // Every change goes through the server, which checks it's your step and logs it.
  const act = async (action, payload = {}, note) => {
    if (action === '_error') {
      toast({ title: 'That didn’t go through', description: payload.message, variant: 'destructive' });
      return null;
    }
    setBusy(true);
    try {
      const fn = action === 'delivery' ? 'scan-project' : 'deal-room';
      const res = await api.functions.invoke(fn, { action, deal_id: deal.id, ...payload });
      const data = res?.data || {};
      if (data.error) throw new Error(data.error);
      if (data.deal) setDeal(data.deal);
      if (note?.body) notifyCounterparty(data.deal || deal, note.body);
      return data;
    } catch (err) {
      toast({ title: 'That didn’t go through', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copyEvidence = async () => {
    const text = evidenceText(deal);
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Deal record copied', description: 'Paste it into Escrow.com or an email if you ever need it.' });
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `handoff-deal-${deal.id}.txt`;
      a.click();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!deal) {
    return <EmptyState icon={ShieldAlert} title="Deal not found" body="It may have been cancelled, or it isn't yours to open." />;
  }

  const iAmParty = deal.buyer_id === user.id || deal.seller_id === user.id;
  const adminView = !iAmParty && user.role === 'admin';
  if (!iAmParty && !adminView) {
    return <EmptyState icon={ShieldAlert} title="This deal isn't yours" body="Only the buyer and seller in a deal can open its room." />;
  }

  const iAmBuyer = deal.buyer_id === user.id;
  const counterpartyName = iAmBuyer ? deal.seller_name : deal.buyer_name;
  const buyerCantCancel = iAmBuyer && Boolean(deal.delivery);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/deals" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← All my deals
        </Link>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">Deal room</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {adminView
            ? `Admin view (read-only) · ${deal.seller_name} selling to ${deal.buyer_name}`
            : `${iAmBuyer ? 'You are buying from' : 'You are selling to'} ${counterpartyName}`}{' '}
          · {formatAmount(deal.amount, deal.currency)}
        </p>
      </div>

      {deal.status === 'cancelled' && (
        <div className="rounded-3xl border border-border bg-secondary/60 p-5">
          <p className="font-display text-sm font-semibold">This deal was cancelled{deal.cancelled_by ? ` by the ${deal.cancelled_by}` : ''}</p>
          <p className="mt-1 text-xs text-muted-foreground">The listing is back on the market.</p>
        </div>
      )}

      {deal.status === 'completed' && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="font-display text-sm font-semibold text-emerald-800 dark:text-emerald-200">Handover complete — the listing is marked sold</p>
          <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-200/80">Both of you can now leave a review. That's the only way reviews exist here.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <DealChecklist deal={deal} user={user} busy={busy || deal.status !== 'open'} act={act} />

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
              <p className="mt-1 text-xs text-muted-foreground">{myReview.rating}/5 — thanks, that helps the next person.</p>
            </div>
          )}

          <div className="card-soft space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-display text-base font-semibold">
                <History className="h-4 w-4 text-primary" /> Deal record
              </p>
              <Button size="sm" variant="outline" className="rounded-full" onClick={copyEvidence}>
                <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Copy the full record
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Written by Handoff's server, not by either of you. If a buyer rejects after receiving the code, Escrow.com
              asks for proof of what was agreed and delivered. This is it.
            </p>
            <ol className="space-y-1.5 border-l border-border/70 pl-4">
              {(deal.log || []).slice().reverse().map((e, i) => (
                <li key={`${e.at}-${i}`} className="text-xs">
                  <span className="text-muted-foreground">{fmt(e.at)} · {e.by}</span>
                  <span className="block">{e.event}</span>
                </li>
              ))}
              {!(deal.log || []).length && <li className="text-xs text-muted-foreground">Nothing recorded yet.</li>}
            </ol>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="card-soft space-y-4 p-5">
            <div className="h-28 w-full overflow-hidden rounded-2xl bg-muted">
              {deal.listing_cover ? <Image src={deal.listing_cover} alt={deal.listing_title} className="h-full w-full object-cover" /> : null}
            </div>
            <div>
              <Link to={`/listing/${deal.listing_id}`} className="font-display text-sm font-semibold hover:text-primary">
                {deal.listing_title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">Agreed at {formatAmount(deal.amount, deal.currency)}</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/60 p-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-secondary text-[10px] font-semibold">{initials(counterpartyName)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-semibold">{counterpartyName}</p>
                <p className="text-[11px] text-muted-foreground">{iAmBuyer ? 'Seller' : 'Buyer'}</p>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full rounded-full">
              <Link to="/messages">Talk it through in chat</Link>
            </Button>
            {deal.status === 'open' && !adminView && (
              buyerCantCancel ? (
                <p className="text-xs text-muted-foreground">
                  The code has been delivered, so this deal can't just be cancelled. If it doesn't match the terms, use
                  "Something doesn't match" — refunds go through Escrow.com.
                </p>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full rounded-full text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => act('cancel', {}, { body: `${myName} cancelled the deal for ${deal.listing_title}.` })}
                >
                  Cancel this deal
                </Button>
              )
            )}
          </div>

          <div className="card-soft space-y-2 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Staying safe</p>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
              <li>Handoff never touches the money. Pay only into the Escrow.com transaction linked here.</li>
              <li>Code goes over only after the money is in escrow, and Handoff records exactly what was delivered.</li>
              <li>Buyers: check against the agreed terms, and accept on Escrow.com when you're happy.</li>
              <li>Sellers: rotate every key and password before you close the deal.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
