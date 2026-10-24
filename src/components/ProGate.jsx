import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { licencePriceLabel, proPriceLabel, usePlan } from '@/lib/billing';
import { BadgeCheck, Crown } from 'lucide-react';

export function ProPill({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200 ${className}`}
    >
      <Crown className="h-3 w-3" /> Pro
    </span>
  );
}

/** "Selling needs a seller licence" card. Only rendered when licences are switched on and the viewer has none. */
export function LicenceGate({ title = 'Selling needs a seller licence', body, className = '' }) {
  const plan = usePlan();
  return (
    <div className={`card-soft flex flex-col gap-3 border-sky-300/60 bg-sky-50/60 p-5 dark:border-sky-500/30 dark:bg-sky-500/5 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
          <BadgeCheck className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-base font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">
            {body ||
              `${licencePriceLabel(plan)}, with everything in Pro included and no commission on your sales. Collabs, finishing jobs and free adoptions stay free.`}
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0 rounded-full">
        <Link to="/pro#seller">Get a seller licence</Link>
      </Button>
    </div>
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
