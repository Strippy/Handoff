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
import { CheckCircle2, Crown, FlaskConical, Loader2 } from 'lucide-react';

const money = (p) => `${p?.currency === 'AUD' ? 'A$' : `${p?.currency || ''} `}${((p?.amount || 0) / 100).toFixed(2)}`;

// Admin-only: Handoff Pro switch, Stripe price and subscriber count.
export default function BillingAdminCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // 'on' | 'off'

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
  const priceOk = status?.price_ready && status.price_livemode === live;

  return (
    <section className="card-soft space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
          <Crown className="h-4 w-4" />
        </span>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-base font-semibold">Handoff Pro</p>
            {status && (
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className={status.pro_enabled ? 'text-emerald-600' : 'text-muted-foreground'}>
                  {status.pro_enabled ? 'On' : 'Off'}
                </span>
                <Switch
                  checked={Boolean(status.pro_enabled)}
                  disabled={Boolean(busy) || (!status.pro_enabled && !priceOk)}
                  onCheckedChange={(next) => setConfirm(next ? 'on' : 'off')}
                  aria-label="Switch Handoff Pro on or off"
                />
              </div>
            )}
          </div>
          {!status ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </p>
          ) : (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                {status.pro_enabled
                  ? 'Free-plan limits are live. Founding builders and subscribers have Pro.'
                  : 'Off — everything is free and nothing is limited. Turn it on when you’re ready to charge.'}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>
                  Stripe:{' '}
                  <strong className={live ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-300'}>
                    {status.stripe_mode === 'none' ? 'not connected' : live ? 'live' : 'test mode'}
                  </strong>
                </span>
                <span>
                  Price:{' '}
                  {priceOk ? (
                    <strong className="inline-flex items-center gap-1 text-foreground">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {money(status.price)}/month
                    </strong>
                  ) : (
                    <strong>not created{status.price_ready ? ' for this Stripe mode' : ''}</strong>
                  )}
                </span>
                <span>
                  Paying subscribers: <strong className="text-foreground">{status.active_subscribers}</strong>
                </span>
                {status.pro_launched_at && (
                  <span>Launched {new Date(status.pro_launched_at).toLocaleDateString()}</span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {status && (
        <div className="flex flex-wrap gap-2 pl-12">
          {!priceOk && status.stripe_mode !== 'none' && (
            <Button size="sm" className="rounded-full" disabled={Boolean(busy)} onClick={act('price', billingAdminSetupPrice)}>
              {busy === 'price' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create the {money(status.price)}/month price in Stripe
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/pro">View the Pro page</Link>
          </Button>
        </div>
      )}

      {status && !live && status.stripe_mode !== 'none' && (
        <p className="ml-12 flex items-start gap-1.5 rounded-xl bg-secondary/70 p-2.5 text-xs text-muted-foreground">
          <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" />
          Stripe is in test mode, so checkout takes test cards only and no money moves. Claim your Stripe sandbox and
          switch to live keys before you turn Pro on for real — then create the price again here.
        </p>
      )}
      {error && <p className="pl-12 text-xs font-medium text-destructive">{error}</p>}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {confirm === 'on' ? 'Switch Handoff Pro on?' : 'Switch Handoff Pro off?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'on' ? (
                <>
                  Free accounts get limited to {status?.rules?.free_active_listings} active listings,{' '}
                  {status?.rules?.free_scans_per_30d} scans every 30 days, {status?.rules?.free_open_offers} open offers,
                  and see new listings after {status?.rules?.early_access_hours} hours.
                  {!status?.pro_launched_at &&
                    ` This starts the founding window: the first ${status?.rules?.founding_count} builders get Pro free for ${status?.rules?.founding_free_months} months from today.`}
                  {!live && ' Stripe is still in test mode, so nobody can actually pay yet.'}
                </>
              ) : (
                'All limits lift immediately and everything is free again. Existing subscriptions keep billing in Stripe until you or the subscriber cancels them.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Not now</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                const next = confirm === 'on';
                setConfirm(null);
                act('toggle', () => billingAdminToggle(next))();
              }}
            >
              {confirm === 'on' ? 'Switch Pro on' : 'Switch Pro off'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
