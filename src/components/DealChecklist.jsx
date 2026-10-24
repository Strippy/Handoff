import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, ExternalLink, Landmark, KeyRound, Package, ShieldCheck, Wrench } from 'lucide-react';

const STEPS = [
  {
    key: 'escrow_set',
    label: 'Money in escrow',
    icon: Landmark,
    who: 'seller',
    hint: 'Open the transaction on Escrow.com, then paste the link below so the buyer can see it.',
  },
  {
    key: 'code_transfer',
    label: 'Code handed over',
    icon: Wrench,
    who: 'seller',
    hint: 'Repo ownership transferred, or a zip with the full source.',
  },
  {
    key: 'asset_transfer',
    label: 'Assets, accounts and keys handed over',
    icon: KeyRound,
    who: 'seller',
    hint: 'Domains, hosting, API keys, third-party accounts, docs.',
  },
  {
    key: 'buyer_confirmed',
    label: 'Buyer checked it works',
    icon: ShieldCheck,
    who: 'buyer',
    hint: 'Spun it up, ran it, happy with what arrived.',
  },
  {
    key: 'sold',
    label: 'Marked sold',
    icon: Package,
    who: 'seller',
    hint: 'Closes the listing, releases escrow and unlocks reviews for both of you.',
  },
];

export default function DealChecklist({ deal, user, onToggle, onSaveNotes, onSaveEscrow, busy }) {
  const done = STEPS.filter((step) => deal[step.key]).length;
  const iAmSeller = deal.seller_id === user?.id;
  const iAmBuyer = deal.buyer_id === user?.id;
  const pct = Math.round((done / STEPS.length) * 100);

  return (
    <div className="card-soft space-y-6 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">The handover pack</h2>
        <p className="text-xs text-muted-foreground">
          Work down the list together. Nothing here is optional paperwork — it's what stops a good deal going wrong.
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-muted-foreground">
              {done} of {STEPS.length} steps done
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2 rounded-full" />
        </div>
      </div>

      <ul className="space-y-3">
        {STEPS.map((step) => {
          const isDone = !!deal[step.key];
          const canTick = (step.who === 'seller' && iAmSeller) || (step.who === 'buyer' && iAmBuyer);
          const blocked = step.key === 'sold' && !deal.buyer_confirmed;
          const Icon = step.icon;
          return (
            <li
              key={step.key}
              className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                isDone ? 'border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-500/10' : 'border-border/70 bg-background/60'
              }`}
            >
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${isDone ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.hint}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  {step.who === 'buyer' ? 'Buyer ticks this' : 'Seller ticks this'}
                </p>
              </div>
              {canTick ? (
                <Button
                  size="sm"
                  variant={isDone ? 'ghost' : 'outline'}
                  className="rounded-full"
                  disabled={busy || blocked}
                  onClick={() => onToggle(step.key, !isDone)}
                >
                  {isDone ? 'Undo' : 'Tick'}
                </Button>
              ) : (
                isDone && <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" />
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-4 border-t border-border/60 pt-5">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Escrow transaction link</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              defaultValue={deal.escrow_url || ''}
              placeholder="https://www.escrow.com/…"
              className="rounded-2xl"
              onBlur={(e) => onSaveEscrow(e.target.value.trim())}
            />
            <Button asChild variant="outline" className="rounded-2xl">
              <a href="https://www.escrow.com/" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Open Escrow.com
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Payments happen between you on Escrow.com — Handoff never holds the money.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Handover notes</Label>
          <Textarea
            defaultValue={deal.handover_notes || ''}
            rows={4}
            placeholder="Repo: …  Domain: …  Keys needed: …  Where the docs live: …"
            className="rounded-2xl"
            onBlur={(e) => onSaveNotes(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Both of you can edit this. It saves when you click away.</p>
        </div>
      </div>
    </div>
  );
}