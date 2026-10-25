import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  FileSignature,
  GitBranch,
  KeyRound,
  Landmark,
  Loader2,
  Lock,
  Package,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400_000));
const isEscrowUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*escrow\.com$/i.test(x.hostname);
  } catch {
    return false;
  }
};

function Stage({ n, icon: Icon, title, who, done, locked, children }) {
  return (
    <li className={`rounded-2xl border p-4 ${done ? 'border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-500/10' : 'border-border/70 bg-background/60'} ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {n}. {title}
            </p>
            {who && <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{who}</span>}
            {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
          </div>
          {children}
        </div>
      </div>
    </li>
  );
}

/**
 * The handover, in order. Every action goes through the server (deal-room / scan-project),
 * which enforces who can do what and when, and logs it with a timestamp.
 */
export default function DealChecklist({ deal, user, busy, act }) {
  const iAmSeller = deal.seller_id === user?.id;
  const iAmBuyer = deal.buyer_id === user?.id;
  const open = deal.status === 'open';
  const terms = deal.terms || { included: [], criteria: '', inspection_days: 3 };
  const bothAgreed = Boolean(deal.terms_hash && deal.terms_agreed_buyer_at && deal.terms_agreed_seller_at);
  const myAgreement = iAmBuyer ? deal.terms_agreed_buyer_at : deal.terms_agreed_seller_at;
  const delivery = deal.delivery;

  // ---- terms editor (seller, until escrow) ----
  const [included, setIncluded] = useState((terms.included || []).join('\n'));
  const [criteria, setCriteria] = useState(terms.criteria || '');
  const [days, setDays] = useState(String(terms.inspection_days || 3));
  useEffect(() => {
    setIncluded((deal.terms?.included || []).join('\n'));
    setCriteria(deal.terms?.criteria || '');
    setDays(String(deal.terms?.inspection_days || 3));
  }, [deal.terms_hash]);
  const termsDirty =
    included.trim() !== (terms.included || []).join('\n').trim() ||
    criteria.trim() !== (terms.criteria || '').trim() ||
    Number(days) !== Number(terms.inspection_days || 3);

  // ---- escrow link ----
  const [escrowUrl, setEscrowUrl] = useState(deal.escrow_url || '');
  const escrowValid = isEscrowUrl(escrowUrl.trim());

  // ---- delivery ----
  const fileRef = useRef(null);
  const [deliverTab, setDeliverTab] = useState('zip');
  const [repo, setRepo] = useState('');
  const [uploading, setUploading] = useState(false);
  const deliverZip = async (file) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return act('_error', { message: 'Deliver a .zip of the full project.' });
    setUploading(true);
    try {
      const up = await api.integrations.Core.UploadPrivateFile({ file });
      await act('delivery', { file_uri: up.file_uri, file_name: file.name }, { body: 'The code has been delivered — check it and mark it received.' });
    } catch (err) {
      act('_error', { message: err?.message || 'Upload failed — try again.' });
    }
    setUploading(false);
  };

  // ---- dispute ----
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [criterion, setCriterion] = useState('');
  const [details, setDetails] = useState('');
  const criteriaLines = (terms.criteria || '').split('\n').map((l) => l.replace(/^[\s•*-]+/, '').trim()).filter(Boolean);

  const steps = [bothAgreed, deal.escrow_set, Boolean(delivery), Boolean(deal.received_at), deal.asset_transfer && deal.keys_rotated, deal.buyer_confirmed, deal.sold];
  const done = steps.filter(Boolean).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div className="card-soft space-y-6 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">The handover</h2>
        <p className="text-xs text-muted-foreground">
          Work down the list together. Each step unlocks the next, and everything is timestamped — that record is what
          protects you both if anything goes wrong.
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-muted-foreground">
              {done} of {steps.length} done
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2 rounded-full" />
        </div>
      </div>

      {deal.dispute?.open && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-semibold">
              {deal.dispute.raised_by === 'buyer' ? 'The buyer' : 'The seller'} raised a problem · {fmt(deal.dispute.at)}
            </p>
            {deal.dispute.criterion && <p className="text-xs"><span className="font-medium">Criterion:</span> {deal.dispute.criterion}</p>}
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{deal.dispute.details}</p>
            <p className="text-xs text-muted-foreground">
              Talk it through in chat first. If you can't sort it out, Escrow.com's dispute process decides what happens to
              the money. Copy the deal record below for them.
            </p>
            {((iAmBuyer && deal.dispute.raised_by === 'buyer') || (iAmSeller && deal.dispute.raised_by === 'seller') || (!iAmBuyer && !iAmSeller && user?.role === 'admin')) && (
              <Button size="sm" variant="outline" className="mt-1 rounded-full" disabled={busy} onClick={() => act('resolve_dispute', {}, { body: 'The problem on your deal was marked resolved.' })}>
                Mark it sorted
              </Button>
            )}
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {/* 1. Terms */}
        <Stage n={1} icon={FileSignature} title="Agree the handover terms" who="Seller writes · both agree" done={bothAgreed}>
          <p className="text-xs text-muted-foreground">
            What's included and exactly how the buyer will check it works. If the buyer rejects later, it has to be against
            one of these — "changed my mind" isn't one. The terms lock once money is in escrow.
          </p>
          {iAmSeller && open && !deal.escrow_set ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">What's included (one per line)</Label>
                <Textarea rows={3} value={included} onChange={(e) => setIncluded(e.target.value)} className="rounded-2xl text-sm" placeholder={'Full source code\nDomain example.com\nStripe account handover'} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">How the buyer checks it works (one check per line)</Label>
                <Textarea
                  rows={4}
                  value={criteria}
                  onChange={(e) => setCriteria(e.target.value)}
                  className="rounded-2xl text-sm"
                  placeholder={'Runs locally with npm install && npm run dev\nSign-up, login and checkout work end to end\nMatches the demo at the listing link'}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Inspection period (days)</Label>
                  <Input type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} className="w-28 rounded-2xl" />
                </div>
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={busy || !termsDirty}
                  onClick={() =>
                    act('set_terms', { included: included.split('\n').map((s) => s.trim()).filter(Boolean), criteria, inspection_days: Number(days) }, { body: 'The seller wrote the handover terms — read and agree to them in the Deal Room.' })
                  }
                >
                  Save terms
                </Button>
              </div>
            </div>
          ) : (
            terms.criteria && (
              <div className="space-y-2 rounded-2xl bg-secondary/50 p-3 text-xs">
                {terms.included?.length > 0 && (
                  <div>
                    <p className="font-semibold">Included</p>
                    <ul className="mt-0.5 list-disc pl-4 text-muted-foreground">{terms.included.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                <div>
                  <p className="font-semibold">How the buyer checks it works</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{terms.criteria}</p>
                </div>
                <p><span className="font-semibold">Inspection period:</span> {terms.inspection_days} days</p>
              </div>
            )
          )}
          {deal.terms_hash && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Fingerprint {deal.terms_hash.slice(0, 12)}</span>
              <span>Seller {deal.terms_agreed_seller_at ? `agreed ${fmt(deal.terms_agreed_seller_at)}` : 'hasn’t agreed'}</span>
              <span>Buyer {deal.terms_agreed_buyer_at ? `agreed ${fmt(deal.terms_agreed_buyer_at)}` : 'hasn’t agreed'}</span>
            </div>
          )}
          {!deal.terms_hash && iAmBuyer && <p className="text-xs font-medium text-muted-foreground">Waiting for the seller to write the terms.</p>}
          {deal.terms_hash && !myAgreement && open && (iAmBuyer || iAmSeller) && !(iAmSeller && termsDirty) && (
            <Button size="sm" className="rounded-full" disabled={busy} onClick={() => act('agree_terms', { terms_hash: deal.terms_hash }, { body: `${iAmBuyer ? 'The buyer' : 'The seller'} agreed to the handover terms.` })}>
              I agree to these terms
            </Button>
          )}
        </Stage>

        {/* 2. Escrow */}
        <Stage n={2} icon={Landmark} title="Money in escrow" who="Seller" done={deal.escrow_set} locked={!bothAgreed}>
          <p className="text-xs text-muted-foreground">
            Open the transaction on Escrow.com with the agreed price and a {terms.inspection_days || 3}-day inspection period
            to match. Code goes over only after the buyer has paid into escrow.
          </p>
          {iAmSeller && open && bothAgreed && !deal.escrow_set && (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={escrowUrl} onChange={(e) => setEscrowUrl(e.target.value)} placeholder="https://www.escrow.com/…" className="rounded-2xl" />
                <Button variant="outline" className="rounded-2xl" disabled={busy || !escrowValid || escrowUrl.trim() === deal.escrow_url} onClick={() => act('escrow', { url: escrowUrl.trim() })}>
                  Save link
                </Button>
                <Button asChild variant="ghost" className="rounded-2xl">
                  <a href="https://www.escrow.com/" target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Escrow.com</a>
                </Button>
              </div>
              {escrowUrl.trim() && !escrowValid && <p className="text-xs font-medium text-destructive">Only links on escrow.com are accepted.</p>}
              <Button size="sm" className="rounded-full" disabled={busy || !deal.escrow_url} onClick={() => act('step', { key: 'escrow_set', value: true }, { body: 'The seller says your payment is in escrow.' })}>
                The buyer's money is in escrow
              </Button>
            </div>
          )}
          {deal.escrow_url && (
            <p className="text-xs">
              <a href={deal.escrow_url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{deal.escrow_url}</a>
            </p>
          )}
          {iAmBuyer && deal.escrow_url && (
            <p className="text-xs text-muted-foreground">
              Check it by logging in at escrow.com yourself, not only through this link. Never pay anywhere else.
            </p>
          )}
        </Stage>

        {/* 3. Delivery */}
        <Stage n={3} icon={Package} title="Deliver the code" who="Seller" done={Boolean(delivery)} locked={!deal.escrow_set}>
          <p className="text-xs text-muted-foreground">
            Handoff records exactly what was handed over: the zip's fingerprint, or the repo and commit, plus a fresh scan.
            That's the seller's proof of delivery.
          </p>
          {iAmSeller && open && deal.escrow_set && !deal.received_at && (
            <div className="space-y-2">
              <div className="inline-flex rounded-full border border-border/70 bg-secondary/60 p-1 text-xs">
                {[
                  { key: 'zip', label: 'Upload a .zip', icon: FileArchive },
                  { key: 'github', label: 'GitHub repo', icon: GitBranch },
                ].map((t) => (
                  <button key={t.key} type="button" onClick={() => setDeliverTab(t.key)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${deliverTab === t.key ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                ))}
              </div>
              {deliverTab === 'zip' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" disabled={busy || uploading} onClick={() => fileRef.current?.click()}>
                    {uploading || busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="mr-1.5 h-3.5 w-3.5" />}
                    {delivery ? 'Replace the delivered zip' : 'Upload the full project .zip'}
                  </Button>
                  <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; deliverZip(f); }} />
                  <span className="text-xs text-muted-foreground">Up to 50MB. Only the buyer can download it.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={repo} onChange={(e) => setRepo(e.target.value.trim())} placeholder="owner/repo" className="rounded-2xl" />
                    <Button size="sm" variant="outline" className="rounded-2xl" disabled={busy || !/^[\w.-]+\/[\w.-]+$/.test(repo)} onClick={() => act('delivery', { repo_full_name: repo }, { body: 'The seller recorded the repo handover — check it and mark it received.' })}>
                      Record this repo
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Record it here first, then transfer the repo on GitHub (Settings → Transfer ownership).</p>
                </div>
              )}
            </div>
          )}
          {delivery && (
            <div className="space-y-1 rounded-2xl bg-secondary/50 p-3 text-xs">
              <p className="font-semibold">
                {delivery.method === 'zip' ? `Zip: ${delivery.label}` : `Repo: ${delivery.repo}`} · {fmt(delivery.at)}
              </p>
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {delivery.method === 'zip' ? `sha256 ${delivery.sha256}` : `commit ${delivery.commit}${delivery.branch ? ` (${delivery.branch})` : ''}`}
              </p>
              <p className="text-muted-foreground">
                {delivery.file_count} files · {Number(delivery.lines_of_code || 0).toLocaleString()} lines · score {delivery.score}
                {delivery.listing_scan && ` (listing scan: ${delivery.listing_scan.score}, ${delivery.listing_scan.file_count} files)`}
                {delivery.secrets_found > 0 && ` · ${delivery.secrets_found} possible secret${delivery.secrets_found === 1 ? '' : 's'} in the code — rotate them`}
              </p>
              {iAmBuyer && delivery.method === 'zip' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 rounded-full"
                  disabled={busy}
                  onClick={async () => {
                    const res = await act('delivery_link');
                    if (res?.url) window.open(res.url, '_blank', 'noopener');
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download the delivered zip
                </Button>
              )}
            </div>
          )}
        </Stage>

        {/* 4. Received → inspection */}
        <Stage n={4} icon={ShieldCheck} title="Buyer marks it received" who="Buyer" done={Boolean(deal.received_at)} locked={!delivery}>
          <p className="text-xs text-muted-foreground">
            Starts the {terms.inspection_days || 3}-day inspection. Mark it received on Escrow.com too, so both clocks match.
          </p>
          {iAmBuyer && open && delivery && !deal.received_at && (
            <Button size="sm" className="rounded-full" disabled={busy} onClick={() => act('received', {}, { body: 'The buyer received the code — the inspection period has started.' })}>
              I've received it
            </Button>
          )}
          {deal.received_at && (
            <p className="text-xs text-muted-foreground">
              Received {fmt(deal.received_at)} · inspection ends {fmt(deal.inspection_ends_at)}
              {open && ` (${daysLeft(deal.inspection_ends_at)} day${daysLeft(deal.inspection_ends_at) === 1 ? '' : 's'} left)`}
            </p>
          )}
        </Stage>

        {/* 5. Assets + keys */}
        <Stage n={5} icon={KeyRound} title="Accounts handed over, keys rotated" who="Seller" done={deal.asset_transfer && deal.keys_rotated} locked={!deal.escrow_set}>
          <p className="text-xs text-muted-foreground">
            Domains, hosting and third-party accounts move to the buyer. Every API key, password and token the project used
            gets revoked or rotated. The buyer sets up their own, so nobody is left holding live keys.
          </p>
          {iAmSeller && open && deal.escrow_set && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={deal.asset_transfer ? 'ghost' : 'outline'} className="rounded-full" disabled={busy || (deal.asset_transfer && deal.buyer_confirmed)} onClick={() => act('step', { key: 'asset_transfer', value: !deal.asset_transfer }, { body: 'The seller updated the account handover.' })}>
                {deal.asset_transfer ? <><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Accounts: undo</> : 'Accounts and assets handed over'}
              </Button>
              <Button size="sm" variant={deal.keys_rotated ? 'ghost' : 'outline'} className="rounded-full" disabled={busy} onClick={() => act('step', { key: 'keys_rotated', value: !deal.keys_rotated }, { body: 'The seller updated the key rotation step.' })}>
                {deal.keys_rotated ? <><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Keys: undo</> : 'Every key and password rotated'}
              </Button>
            </div>
          )}
          {!iAmSeller && (
            <p className="text-xs text-muted-foreground">
              {deal.asset_transfer ? 'Accounts handed over.' : 'Accounts not handed over yet.'} {deal.keys_rotated ? 'Seller confirmed keys are rotated.' : 'Keys not confirmed rotated yet.'}
            </p>
          )}
        </Stage>

        {/* 6. Buyer confirms */}
        <Stage n={6} icon={ShieldCheck} title="Buyer confirms it works as agreed" who="Buyer" done={deal.buyer_confirmed} locked={!deal.received_at}>
          <p className="text-xs text-muted-foreground">Check it against the agreed terms, then accept on Escrow.com as well so the seller gets paid.</p>
          {iAmBuyer && open && deal.received_at && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={deal.buyer_confirmed ? 'ghost' : 'default'} className="rounded-full" disabled={busy} onClick={() => act('step', { key: 'buyer_confirmed', value: !deal.buyer_confirmed }, { body: deal.buyer_confirmed ? 'The buyer withdrew their confirmation.' : 'The buyer confirmed it works as agreed.' })}>
                {deal.buyer_confirmed ? 'Undo confirmation' : 'It works as agreed'}
              </Button>
              {!deal.buyer_confirmed && !deal.dispute?.open && (
                <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => setDisputeOpen(true)}>
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Something doesn't match
                </Button>
              )}
            </div>
          )}
          {iAmSeller && open && deal.escrow_set && !deal.dispute?.open && (
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={busy} onClick={() => setDisputeOpen(true)}>
              Raise a problem
            </Button>
          )}
        </Stage>

        {/* 7. Complete */}
        <Stage n={7} icon={CheckCircle2} title="Mark the deal complete" who="Seller" done={deal.sold} locked={!deal.buyer_confirmed}>
          <p className="text-xs text-muted-foreground">Closes the listing as sold and opens reviews for both of you.</p>
          {iAmSeller && open && deal.buyer_confirmed && (
            <Button size="sm" className="rounded-full" disabled={busy || !deal.keys_rotated || deal.dispute?.open} onClick={() => act('step', { key: 'sold', value: true }, { body: 'The deal is complete — you can leave a review now.' })}>
              Complete the deal
            </Button>
          )}
          {iAmSeller && open && deal.buyer_confirmed && !deal.keys_rotated && <p className="text-xs font-medium text-muted-foreground">Confirm keys are rotated first (step 5).</p>}
        </Stage>
      </ol>

      <div className="space-y-2 border-t border-border/60 pt-5">
        <Label className="text-sm font-medium">Handover notes</Label>
        <Textarea
          defaultValue={deal.handover_notes || ''}
          rows={4}
          disabled={!open}
          placeholder="Where the docs live, how to deploy, anything the next owner should know…"
          className="rounded-2xl"
          onBlur={(e) => e.target.value !== (deal.handover_notes || '') && act('notes', { notes: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">Both of you can edit this. Don't paste passwords or keys here — hand those over directly and rotate them after.</p>
      </div>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{iAmBuyer ? 'What doesn’t match the terms?' : 'Raise a problem'}</DialogTitle>
            <DialogDescription>
              It goes on the deal record with a timestamp and to the Handoff team. Refunds are decided through Escrow.com,
              not here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {iAmBuyer && criteriaLines.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Which agreed check fails?</Label>
                <div className="space-y-1.5">
                  {criteriaLines.map((line) => (
                    <label key={line} className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/70 p-2 text-sm">
                      <input type="radio" name="criterion" className="mt-1" checked={criterion === line} onChange={() => setCriterion(line)} />
                      <span>{line}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">What happened?</Label>
              <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} className="rounded-2xl" placeholder="What you tried, what you expected, what you saw instead." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="rounded-full" onClick={() => setDisputeOpen(false)}>Cancel</Button>
            <Button
              className="rounded-full"
              disabled={busy || details.trim().length < 20 || (iAmBuyer && criteriaLines.length > 0 && !criterion)}
              onClick={async () => {
                const res = await act('dispute', { criterion, details }, { body: `${iAmBuyer ? 'The buyer' : 'The seller'} raised a problem on your deal.` });
                if (res) {
                  setDisputeOpen(false);
                  setDetails('');
                  setCriterion('');
                }
              }}
            >
              Raise it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
