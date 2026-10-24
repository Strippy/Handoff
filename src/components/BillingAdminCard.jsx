import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { billingAdminSetupPrice, billingAdminStatus, billingAdminToggle, billingError } from '@/lib/billing';
import { BadgeCheck, CheckCircle2, Crown, FlaskConical, Loader2 } from 'lucide-react';

const money = (p) => {
  const amount = (p?.amount || 0) / 100;
  const value = Number.isInteger(amount) ? amount : amount.toFixed(2);
  const every = (p?.interval_count || 1) === 1 ? '/month' : ` every ${p.interval_count} months`;
  return `${p?.currency === 'AUD' ? 'A$' : `${p?.currency || ''} `}${value}${every}`;
};

const PLAN_COPY = {
  seller: {
    title: 'Seller licence',
    icon: BadgeCheck,
    tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
    off: 'Off — anyone can sell. Turn it on to require a licence for selling and licensing projects.',
    on: 'On — selling and licensing need a licence. Collabs, finishing jobs and free adoptions stay free.',
    confirmOn: () =>
      `Builders will need a licence to publish a full sale or licence listing, or to accept an offer on one. Collabs, finishing jobs and free adoptions stay free.`,
    confirmOff: 'Anyone can sell again. Existing licences keep billing in Stripe until the builder cancels.',
  },
  pro: {
    title: 'Handoff Pro',
    icon: Crown,
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    off: 'Off — everything is free and nothing is limited.',
    on: 'On — free-plan limits are live. Founding builders and subscribers have Pro.',
    confirmOn: (r) =>
      `Free accounts get ${r?.free_active_listings} active listings, ${r?.free_scans_per_30d} scans every 30 days, ${r?.free_open_offers} open offers, and see new listings after ${r?.early_access_hours} hours.`,
    confirmOff: 'All limits lift immediately. Existing subscriptions keep billing in Stripe until the subscriber cancels.',
  },
};

// Admin-only: switches, Stripe prices and subscriber counts for both paid plans.
export default function BillingAdminCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // { plan, on }

  const refresh = () =>
    billingAdminStatus()
      .then(setStatus)
      .catch((err) => setError(billingError(err)));

  useEffect(() => {
    refresh();
  }, []);

  const act = (key, fn) => async () => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(billingError(err));
    }
    setBusy('');
  };

  const live = status?.stripe_mode === 'live';
  const rules = status?.rules;

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-base font-semibold">Paid plans</p>
        {status && (
          <span className="text-xs">
            Stripe:{' '}
            <strong className={live ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-300'}>
              {status.stripe_mode === 'none' ? 'not connected' : live ? 'live' : 'test mode'}
            </strong>
          </span>
        )}
      </div>

      {!status ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
        </p>
      ) : (
        ['seller', 'pro'].map((key) => {
          const p = status.plans?.[key] || {};
          const copy = PLAN_COPY[key];
          const Icon = copy.icon;
          const priceOk = p.price_ready && p.price_livemode === live;
          return (
            <div key={key} className="space-y-2 rounded-2xl border border-border/60 p-4">
              <div className="flex items-start gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${copy.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{copy.title}</p>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span className={p.enabled ? 'text-emerald-600' : 'text-muted-foreground'}>{p.enabled ? 'On' : 'Off'}</span>
                      <Switch
                        checked={Boolean(p.enabled)}
                        disabled={Boolean(busy) || (!p.enabled && !priceOk)}
                        onCheckedChange={(next) => setConfirm({ plan: key, on: next })}
                        aria-label={`Switch ${copy.title} on or off`}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.enabled ? copy.on : copy.off}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Price:{' '}
                      {priceOk ? (
                        <strong className="inline-flex items-center gap-1 text-foreground">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {money(p.price)}
                        </strong>
                      ) : (
                        <strong>not created{p.price_ready ? ' for this Stripe mode' : ''}</strong>
                      )}
                    </span>
                    <span>
                      Paying: <strong className="text-foreground">{p.active_subscribers || 0}</strong>
                    </span>
                    {p.launched_at && <span>Launched {new Date(p.launched_at).toLocaleDateString()}</span>}
                  </p>
                  {!priceOk && status.stripe_mode !== 'none' && (
                    <Button size="sm" className="mt-1 rounded-full" disabled={Boolean(busy)} onClick={act(`price-${key}`, () => billingAdminSetupPrice(key))}>
                      {busy === `price-${key}` && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Create the {money(p.price)} price in Stripe
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {status && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/pro">View the plans page</Link>
          </Button>
        </div>
      )}

      {status && !live && status.stripe_mode !== 'none' && (
        <p className="flex items-start gap-1.5 rounded-xl bg-secondary/70 p-2.5 text-xs text-muted-foreground">
          <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" />
          Stripe is in test mode, so checkout takes test cards only and no money moves. Claim your Stripe sandbox and
          switch to live keys before you turn a plan on for real — then create the prices again here.
        </p>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-3xl">
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">
                  {confirm.on ? `Switch ${PLAN_COPY[confirm.plan].title} on?` : `Switch ${PLAN_COPY[confirm.plan].title} off?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirm.on ? (
                    <>
                      {PLAN_COPY[confirm.plan].confirmOn(rules)}
                      {!status?.plans?.[confirm.plan]?.launched_at &&
                        ` This starts the founding window: the first ${rules?.founding_count} builders get it free for ${rules?.founding_free_months} months from today.`}
                      {!live && ' Stripe is still in test mode, so nobody can actually pay yet.'}
                    </>
                  ) : (
                    PLAN_COPY[confirm.plan].confirmOff
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Not now</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full"
                  onClick={() => {
                    const { plan, on } = confirm;
                    setConfirm(null);
                    act(`toggle-${plan}`, () => billingAdminToggle(on, plan))();
                  }}
                >
                  {confirm.on ? 'Switch it on' : 'Switch it off'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
