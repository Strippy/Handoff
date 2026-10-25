// The app's single connection to its backend:
//   api.entities.<Name>  – tables in Supabase Postgres (row-level security applies)
//   api.auth             – Supabase Auth (email + password, Google)
//   api.functions        – the server functions under /api (Stripe, Deal Room, scanner, GitHub)
//   api.integrations     – file uploads to Supabase Storage
import { createClient } from '@supabase/supabase-js';
import { createEntities, DataError } from './entities.js';
import { PUBLIC_SUPABASE_KEY, PUBLIC_SUPABASE_URL } from './public-config.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || PUBLIC_SUPABASE_KEY;
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---- live updates ----------------------------------------------------------------------------
let channelSeq = 0;
function realtime(table, callback) {
  const channel = supabase
    .channel(`${table}-${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      const type = payload.eventType === 'INSERT' ? 'create' : payload.eventType === 'UPDATE' ? 'update' : 'delete';
      const data = payload.eventType === 'DELETE' ? payload.old : payload.new;
      callback({ type, id: data?.id, data });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

const entities = createEntities(supabase, { realtime });

// ---- auth ------------------------------------------------------------------------------------
const authError = (error, fallback) => new DataError(error?.message || fallback, error?.status || 400);
const origin = () => window.location.origin;

const auth = {
  async me() {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) throw new DataError('Not signed in', 401);
    const { data: row } = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
    return {
      id: session.user.id,
      email: session.user.email || row?.email || '',
      full_name: row?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
      role: row?.role || 'user',
      created_date: row?.created_date || session.user.created_at,
    };
  },

  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session);
  },

  async updateMe(patch) {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) throw new DataError('Not signed in', 401);
    const { error } = await supabase.from('users').update({ full_name: patch.full_name }).eq('id', data.session.user.id);
    if (error) throw authError(error, 'Could not update your account.');
    return auth.me();
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw authError(error, 'Invalid email or password');
    return data;
  },

  async loginWithProvider(provider, returnTo = '/') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: origin() + (returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/') },
    });
    if (error) throw authError(error, 'Could not start sign-in.');
  },

  /** Creates the account and emails a confirmation link (and a 6-digit code if the email template includes it). */
  async register({ email, password, returnTo = '/' }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: origin() + (returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/') },
    });
    if (error) throw authError(error, 'Registration failed');
    return { needsConfirmation: !data.session, session: data.session };
  },

  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' });
    if (error) throw authError(error, 'Invalid verification code');
    return data;
  },

  async resendOtp(email) {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: origin() } });
    if (error) throw authError(error, 'Failed to resend');
  },

  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/reset-password` });
    if (error) throw authError(error, 'Could not send the reset email.');
  },

  /** Called on /reset-password after the emailed link has signed the user in. */
  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw authError(error, 'Failed to reset password');
  },

  onChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  },

  async logout(redirectTo = '/login') {
    await supabase.auth.signOut();
    if (redirectTo) window.location.href = redirectTo;
  },

  redirectToLogin(returnTo = window.location.pathname + window.location.search) {
    const target = returnTo && returnTo !== '/' ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';
    window.location.href = target;
  },
};

// ---- server functions ------------------------------------------------------------------------
const functions = {
  async invoke(name, payload = {}) {
    const { data } = await supabase.auth.getSession();
    const headers = { 'content-type': 'application/json' };
    if (data?.session?.access_token) headers.authorization = `Bearer ${data.session.access_token}`;
    const res = await fetch(`${API_BASE}/api/${encodeURIComponent(name)}`, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { error: text || res.statusText };
    }
    if (!res.ok) throw new DataError(body?.error || `Request failed (${res.status})`, res.status, body);
    return { data: body, status: res.status };
  },
};

// ---- file uploads ----------------------------------------------------------------------------
async function upload(bucket, file) {
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;
  if (!userId) throw new DataError('Sign in to upload files.', 401);
  const safeName = String(file?.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new DataError(error.message || 'Upload failed — try again.', 400);
  return path;
}

const integrations = {
  Core: {
    async UploadPublicFile({ file }) {
      const path = await upload('public-files', file);
      return { file_url: supabase.storage.from('public-files').getPublicUrl(path).data.publicUrl };
    },
    async UploadPrivateFile({ file }) {
      const path = await upload('private-files', file);
      return { file_uri: `private-files/${path}` };
    },
  },
};

export const api = { entities, auth, functions, integrations };
export { DataError };
