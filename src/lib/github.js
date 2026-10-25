import { api } from '@/api/client';

// All GitHub calls go through the `github` backend function; tokens never reach the browser.
const call = async (action, payload = {}) => {
  const res = await api.functions.invoke('github', { action, ...payload });
  return res?.data || {};
};

export const githubError = (err) => err?.response?.data?.error || err?.message || 'GitHub request failed — try again.';
export const githubStatus = () => call('status');
export const githubRepos = () => call('repos');
export const githubDisconnect = () => call('disconnect');
export const githubExchange = (code) => call('exchange', { code, origin: window.location.origin });
export const githubManifestComplete = (code, state) => call('manifest_complete', { code, state });

const FLOW_KEY = 'handoff_github_flow';
const RETURN_KEY = 'handoff_github_return';
const FLOW_TTL_MS = 20 * 60 * 1000;

const store = {
  get(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* storage blocked */ }
  },
};

const randomState = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');

const here = () => `${window.location.pathname}${window.location.search}`;

/** Sign in with GitHub (authorize the app). Comes back to /github/callback, then to returnTo. */
export async function startGithubConnect(returnTo = here()) {
  const state = randomState();
  store.set(FLOW_KEY, { state, returnTo, at: Date.now() });
  const { url } = await call('authorize_url', { origin: window.location.origin, state });
  window.location.assign(url);
}

/** Open GitHub's "choose which repos Handoff can read" page. GitHub sends people back to /github/callback. */
export function openGithubInstall(installUrl, returnTo = here()) {
  store.set(RETURN_KEY, { returnTo, at: Date.now() });
  window.location.assign(installUrl);
}

/** Read and clear the pending sign-in flow (state check against CSRF). */
export function takeGithubFlow() {
  const flow = store.get(FLOW_KEY);
  store.remove(FLOW_KEY);
  if (!flow || Date.now() - flow.at > FLOW_TTL_MS) return null;
  return flow;
}

export function takeGithubReturn() {
  const r = store.get(RETURN_KEY);
  store.remove(RETURN_KEY);
  if (!r || Date.now() - r.at > FLOW_TTL_MS) return null;
  return r.returnTo;
}

/** Admin: create the GitHub App in one click via GitHub's manifest flow. */
export async function startGithubAppSetup({ force = false } = {}) {
  const { post_url: postUrl, manifest } = await call('manifest_start', { origin: window.location.origin, force });
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = postUrl;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'manifest';
  input.value = JSON.stringify(manifest);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
