import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// All billing goes through the `billing` backend function. Stripe keys and
// subscription records never reach the browser.
const call = async (action, payload = {}) => {
  const res = await base44.functions.invoke('billing', { action, ...payload });
  return res?.data || {};
};

export const billingError = (err) =>
  err?.response?.data?.error || err?.message || 'Billing request failed — try again.';

// ---- shared plan state (one fetch per page load, refreshed after changes) ----
let cached = null;
let inflight = null;
const listeners = new Set();
const publish = (plan) => {
  cached = plan;
  listeners.forEach((fn) => fn(plan));
  return plan;
};

export function loadPlan(force = false) {
  if (cached && !force) return Promise.resolve(cached);
  if (!inflight) {
    inflight = call('status')
      .then(publish)
      .catch(() => publish({ pro_enabled: false, is_pro: false, error: true }))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Current user's plan. `null` while loading. */
export function usePlan() {
  const [plan, setPlan] = useState(cached);
  useEffect(() => {
    listeners.add(setPlan);
    loadPlan();
    return () => listeners.delete(setPlan);
  }, []);
  return plan;
}

/** True when Pro is switched on and this user is on the free plan. */
export const onFreePlan = (plan) => Boolean(plan?.pro_enabled && !plan?.is_pro);

/** Remaining allowance for a free-plan limit, or Infinity when nothing is gated. */
export function remaining(plan, limitKey, usageKey) {
  if (!onFreePlan(plan)) return Infinity;
  const cap = plan?.limits?.[limitKey] ?? 0;
  const used = plan?.usage?.[usageKey] ?? 0;
  return Math.max(0, cap - used);
}

export function proPriceLabel(plan) {
  const amount = (plan?.price?.amount ?? 850) / 100;
  const currency = plan?.price?.currency || 'AUD';
  const symbol = currency === 'AUD' ? 'A$' : currency === 'USD' ? 'US$' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}/month`;
}

/** Hours of early access left on a fresh listing for free-plan viewers (0 = open to all). */
export function earlyAccessLeft(plan, listing) {
  if (!onFreePlan(plan) || !listing?.created_date) return 0;
  const hours = plan?.limits?.early_access_hours ?? 48;
  const opensAt = Date.parse(listing.created_date) + hours * 3600_000;
  return Math.max(0, Math.ceil((opensAt - Date.now()) / 3600_000));
}

/** ISO cutoff: listings created after this are Pro-only for free-plan viewers. */
export function earlyAccessCutoff(plan) {
  if (!onFreePlan(plan)) return null;
  const hours = plan?.limits?.early_access_hours ?? 48;
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

// ---- member actions ----
export async function startProCheckout() {
  const { url } = await call('checkout', { origin: window.location.origin });
  if (!url) throw new Error('Checkout did not start — try again.');
  window.location.assign(url);
}
export const confirmProCheckout = async (sessionId) => publish(await call('confirm', { session_id: sessionId }));
export const cancelPro = async () => publish(await call('cancel'));
export const resumePro = async () => publish(await call('resume'));

// ---- admin ----
export const billingAdminStatus = () => call('admin_status');
export const billingAdminSetupPrice = () => call('admin_setup_price');
export const billingAdminToggle = async (enabled) => {
  const res = await call('admin_toggle', { enabled });
  await loadPlan(true);
  return res;
};
