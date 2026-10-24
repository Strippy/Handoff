import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { proPriceLabel, usePlan } from '@/lib/billing';
import { Crown } from 'lucide-react';

export function ProPill({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200 ${className}`}
    >
      <Crown className="h-3 w-3" /> Pro
    </span>
  );
}

/** Friendly "this needs Pro" card. Only rendered when Pro is switched on and the viewer is on the free plan. */
export default function ProGate({ title, body, compact = false, className = '' }) {
  const plan = usePlan();
  return (
    <div
      className={`card-soft flex flex-col gap-3 border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5 ${
        compact ? 'p-4' : 'p-5 sm:flex-row sm:items-center sm:justify-between'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
          <Crown className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-base font-semibold">{title}</p>
          {body && <p className="text-sm text-muted-foreground">{body}</p>}
        </div>
      </div>
      <Button asChild className="shrink-0 rounded-full">
        <Link to="/pro">Get Pro · {proPriceLabel(plan)}</Link>
      </Button>
    </div>
  );
}
