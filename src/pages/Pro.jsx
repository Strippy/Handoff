import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  billingError,
  cancelPro,
  confirmProCheckout,
  licencePriceLabel,
  loadPlan,
  proPriceLabel,
  resumePro,
  startLicenceCheckout,
  startProCheckout,
  usePlan,
} from '@/lib/billing';
import { BadgeCheck, Check, CreditCard, Crown, FlaskConical, Loader2, Minus, PartyPopper, ShieldCheck } from 'lucide-react';

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// Only features that exist in the app today.
const rows = (limits) => [
  { label: 'Browse, message, ask questions, save, deal rooms', free: true, pro: true },
  { label: 'Active listings at once', free: String(limits.active_listings), pro: 'Unlimited' },
  { label: 'Code scans', free: `${limits.scans_per_30d} every 30 days`, pro: 'Unlimited*' },
  { label: 'Open offers at once', free: String(limits.open_offers), pro: 'Unlimited' },
  { label: 'New listings', free: `After ${limits.early_access_hours} hours`, pro: 'The moment they’re posted' },
  { label: 'Listing insights (saves, chats, offers, questions)', free: false, pro: true },
];

function Cell({ value }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-emerald-600" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/60" />;
  return <span>{value}</span>;
}

function Meter({ label, used, cap }) {
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${used >= cap ? 'text-amber-700 dark:text-amber-300' : ''}`}>
          {used} / {cap}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${used >= cap ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Pro() {
  const plan = usePlan();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const confirmed = useRef(false);
  const sessionId = params.get('session_id');
  const cancelled = params.get('cancelled') === '1';

  useEffect(() => {
    if (!sessionId || confirmed.current) return;
    confirmed.current = true;
    setBusy('confirm');
    confirmProCheckout(sessionId)
      .then((res) => {
        toast(
          res?.confirmed_plan === 'seller'
            ? { title: 'Seller licence active', description: 'You can list projects for sale and accept offers.' }
            : { title: 'Welcome to Handoff Pro', description: 'Everything’s unlocked. Thanks for backing the place.' }
        );
        setParams({}, { replace: true });
      })
      .catch((err) => setError(billingError(err)))
      .finally(() => setBusy(''));
  }, [sessionId]);

  useEffect(() => {
    loadPlan(true);
  }, []);

  // /pro#seller jumps to the licence section once it has rendered
  useEffect(() => {
    if (plan && window.location.hash === '#seller') document.getElementById('seller')?.scrollIntoView({ behavior: 'smooth' });
  }, [Boolean(plan)]);

  const run = (key, fn, done) => async () => {
    setBusy(key);
    setError('');
    try {
      await fn();
      if (done) toast({ title: done });
    } catch (err) {
      setError(billingError(err));
    }
    setBusy('');
  };

  if (!plan || busy === 'confirm') {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        {busy === 'confirm' && <p className="text-sm">Confirming your subscription with Stripe…</p>}
      </div>
    );
  }

  const limits = plan.limits || { active_listings: 2, scans_per_30d: 3, open_offers: 3, early_access_hours: 48 };
  const sub = plan.subscription;
  const price = proPriceLabel(plan);
  const canTestCheckout = !plan.pro_enabled && plan.is_admin && plan.test_mode && plan.checkout_ready && !sub;
  const showSubscribe = plan.pro_enabled && !plan.is_pro;
  const seller = plan.seller || {};
  const lsub = seller.subscription;
  const licencePrice = licencePriceLabel(plan);
  const canTestLicence = !seller.enabled && plan.is_admin && plan.test_mode && seller.checkout_ready && !lsub;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="card-soft relative overflow-hidden p-6 sm:p-8">
        <div className="space-y-3">
          <span className="chip">
            <Crown className="h-3 w-3 text-amber-600" /> Handoff Pro
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {plan.is_pro && plan.pro_enabled ? 'You’re on Pro.' : 'More room to build, buy and sell.'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            {price}. Unlimited listings and scans, first look at new projects, and the numbers behind your listings.
            Handoff doesn’t take a cut of your sales.
          </p>
        </div>
      </section>

      {cancelled && (
        <p className="rounded-2xl bg-secondary p-3 text-sm text-muted-foreground">Checkout cancelled — nothing was charged.</p>
      )}
      {error && <p className="rounded-2xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</p>}

      {/* status */}
      {!plan.pro_enabled ? (
        <div className="card-soft flex items-start gap-3 p-5">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-display text-base font-semibold">Everything is free right now</p>
            <p className="text-sm text-muted-foreground">
              Pro hasn’t launched yet, so there are no limits — list, scan and make offers as much as you like. When Pro
              switches on, the first 100 builders to join Handoff get Pro free for 12 months.
            </p>
          </div>
        </div>
      ) : plan.source === 'founding' ? (
        <div className="card-soft flex items-start gap-3 border-amber-300/60 p-5">
          <Crown className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-display text-base font-semibold">Founding builder — Pro is on us</p>
            <p className="text-sm text-muted-foreground">
              You were one of the first 100 builders here, so Pro is free until {fmtDate(plan.pro_until)}. Nothing to
              set up and no card needed.
            </p>
          </div>
        </div>
      ) : plan.source === 'admin' ? (
        <div className="card-soft flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-display text-base font-semibold">Admin — Pro is always on for you</p>
            <p className="text-sm text-muted-foreground">Switch Pro on or off for everyone from the admin desk.</p>
          </div>
        </div>
      ) : null}

      {plan.is_admin && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/admin">Open the admin desk</Link>
          </Button>
          {canTestCheckout && (
            <Button variant="outline" className="rounded-full" disabled={Boolean(busy)} onClick={run('checkout', startProCheckout)}>
              {busy === 'checkout' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
              Try checkout with a test card
            </Button>
          )}
        </div>
      )}

      <section id="seller" className="card-soft scroll-mt-24 space-y-3 border-sky-300/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-display text-base font-semibold">
            <BadgeCheck className="h-4 w-4 text-sky-600" /> Seller licence
          </p>
          <span className="text-sm font-semibold">{licencePrice}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Needed to sell or license a project on Handoff. It keeps scam listings out, pays for the code scanner and the
          deal records that protect sellers, and shows a “Licensed seller” badge on your listings. Collabs, finishing
          jobs and free adoptions don’t need one.
        </p>
        {!seller.enabled ? (
          <p className="rounded-2xl bg-secondary/60 p-3 text-sm text-muted-foreground">
            Selling is free right now — no licence needed. When licences switch on, the first 100 builders get one free
            for 12 months.
          </p>
        ) : seller.licensed && seller.source === 'founding' ? (
          <p className="rounded-2xl bg-secondary/60 p-3 text-sm text-muted-foreground">
            Founding builder — your licence is free until {fmtDate(seller.until)}.
          </p>
        ) : seller.licensed && seller.source === 'admin' ? (
          <p className="rounded-2xl bg-secondary/60 p-3 text-sm text-muted-foreground">Admin — always licensed.</p>
        ) : !seller.licensed ? (
          seller.checkout_ready ? (
            <Button className="rounded-full" disabled={Boolean(busy)} onClick={run('licence', startLicenceCheckout)}>
              {busy === 'licence' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
              Get a seller licence · {licencePrice}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Licences are being set up — check back soon.</p>
          )
        ) : null}
        {lsub && (
          <div className="space-y-2 rounded-2xl border border-border/60 p-3">
            <p className="text-sm text-muted-foreground">
              {lsub.status === 'past_due'
                ? 'Your last licence payment didn’t go through — Stripe will retry. Update your card from the receipt email.'
                : ['active', 'trialing'].includes(lsub.status)
                  ? lsub.cancel_at_period_end
                    ? `Cancelled — your licence runs until ${fmtDate(lsub.current_period_end)}.`
                    : `Licensed · renews ${fmtDate(lsub.current_period_end)}.`
                  : 'Your licence has ended.'}
            </p>
            {['active', 'trialing', 'past_due'].includes(lsub.status) &&
              (lsub.cancel_at_period_end ? (
                <Button size="sm" className="rounded-full" disabled={Boolean(busy)} onClick={run('lresume', () => resumePro('seller'), 'Your licence will keep renewing')}>
                  Keep my licence
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(busy)} onClick={run('lcancel', () => cancelPro('seller'), 'Licence cancelled')}>
                  Cancel licence
                </Button>
              ))}
          </div>
        )}
        {canTestLicence && (
          <Button variant="outline" size="sm" className="rounded-full" disabled={Boolean(busy)} onClick={run('licence', startLicenceCheckout)}>
            <FlaskConical className="mr-2 h-4 w-4" /> Try licence checkout with a test card
          </Button>
        )}
      </section>

      {sub && (
        <div className="card-soft space-y-3 p-5">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <p className="font-display text-base font-semibold">Your subscription</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {sub.status === 'past_due'
              ? 'Your last payment didn’t go through — Stripe will retry. Update your card from the receipt email to keep Pro.'
              : ['active', 'trialing'].includes(sub.status)
                ? sub.cancel_at_period_end
                  ? `Cancelled — you keep Pro until ${fmtDate(sub.current_period_end)}, then you’re back on the free plan.`
                  : `${price} · renews ${fmtDate(sub.current_period_end)}.`
                : 'Your subscription has ended.'}
          </p>
          {['active', 'trialing', 'past_due'].includes(sub.status) && (
            <div className="flex flex-wrap gap-2">
              {sub.cancel_at_period_end ? (
                <Button className="rounded-full" disabled={Boolean(busy)} onClick={run('resume', resumePro, 'Pro will keep renewing')}>
                  {busy === 'resume' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Keep my subscription
                </Button>
              ) : (
                <Button variant="outline" className="rounded-full" disabled={Boolean(busy)} onClick={run('cancel', cancelPro, 'Subscription cancelled')}>
                  {busy === 'cancel' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cancel subscription
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {plan.pro_enabled && !plan.is_pro && plan.usage && (
        <div className="card-soft space-y-3 p-5">
          <p className="font-display text-base font-semibold">Your free plan</p>
          <Meter label="Active listings" used={plan.usage.active_listings} cap={limits.active_listings} />
          <Meter label="Code scans in the last 30 days" used={plan.usage.scans_30d} cap={limits.scans_per_30d} />
          <Meter label="Open offers" used={plan.usage.open_offers} cap={limits.open_offers} />
        </div>
      )}

      {/* comparison */}
      <section className="card-soft overflow-hidden">
        <div className="grid grid-cols-[1fr_6.5rem_7.5rem] items-center gap-2 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[1fr_9rem_10rem] sm:px-5">
          <span>What you get</span>
          <span className="text-center">Free</span>
          <span className="text-center text-amber-700 dark:text-amber-300">Pro</span>
        </div>
        {rows(limits).map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_6.5rem_7.5rem] items-center gap-2 border-b border-border/40 px-4 py-3 text-sm last:border-0 sm:grid-cols-[1fr_9rem_10rem] sm:px-5"
          >
            <span>{row.label}</span>
            <span className="text-center text-muted-foreground"><Cell value={row.free} /></span>
            <span className="text-center font-medium"><Cell value={row.pro} /></span>
          </div>
        ))}
      </section>

      {showSubscribe && (
        <div className="card-soft space-y-3 p-5 text-center">
          {plan.checkout_ready ? (
            <>
              <Button size="lg" className="rounded-full px-8" disabled={Boolean(busy)} onClick={run('checkout', startProCheckout)}>
                {busy === 'checkout' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
                Get Pro · {price}
              </Button>
              <p className="text-xs text-muted-foreground">
                Secure checkout by Stripe — Handoff never sees your card. Cancel any time here and keep Pro until the end
                of the month you paid for.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Payments are being set up — check back soon.</p>
          )}
        </div>
      )}

      {plan.test_mode && (plan.pro_enabled || seller.enabled || plan.is_admin) && (
        <p className="flex items-start gap-2 rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Payments are in test mode: no real money moves. Use card 4242 4242 4242 4242 with any future expiry and any CVC.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        *Unlimited scans are still capped at 12 a day per builder to keep the scanner fast for everyone.
      </p>
    </div>
  );
}
