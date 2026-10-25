// GitHub sign-in for Handoff, via a read-only GitHub App (Contents: read, Metadata: read).
// - One-click setup for the admin (GitHub App manifest flow): credentials never pass through anyone's hands.
// - Builders connect their GitHub, pick which repos the app may read, and get a verified-owner badge.
// Tokens and app credentials live in server-only entities (RLS denies all client access).
import { createClientFromRequest, isAllowedOrigin, publicOrigin } from "../compat.js";

const PUBLISHED_ORIGIN = publicOrigin();
const GH_API = "https://api.github.com";
const UA = "handoff-marketplace";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Row = Record<string, any>;
const items = (res: unknown): Row[] => (Array.isArray(res) ? res : (res as { items?: Row[] })?.items || []);
// Redirects (Stripe checkout, GitHub) only ever go back to this site.
const okOrigin = isAllowedOrigin;
const iso = (secs?: number) => (secs ? new Date(Date.now() + secs * 1000).toISOString() : "");

function gh(path: string, token?: string, init: RequestInit = {}) {
  return fetch(path.startsWith("http") ? path : GH_API + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init.headers as Record<string, string>) || {}),
    },
  });
}

async function getConfig(db: any): Promise<Row | null> {
  return items(await db.AppConfig.filter({ key: "github_app" }))[0] || null;
}

async function oauthToken(cfg: Row, params: Record<string, string>) {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ client_id: cfg.github_client_id, client_secret: cfg.github_client_secret, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || !j.access_token) throw new HttpError(400, j.error_description || j.error || "GitHub sign-in failed — try again.");
  return j as { access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number };
}

// Returns a valid user token, refreshing it when it is about to expire. null = needs reconnect.
async function userToken(db: any, cfg: Row, userId: string): Promise<{ token: string; row: Row } | null> {
  const row = items(await db.GithubToken.filter({ user_id: userId }))[0];
  if (!row?.access_token) return null;
  const expiring = row.expires_at && Date.parse(row.expires_at) - Date.now() < 120_000;
  if (!expiring) return { token: row.access_token, row };
  if (!row.refresh_token || (row.refresh_expires_at && Date.parse(row.refresh_expires_at) < Date.now())) return null;
  try {
    const t = await oauthToken(cfg, { grant_type: "refresh_token", refresh_token: row.refresh_token });
    const patch = {
      access_token: t.access_token,
      refresh_token: t.refresh_token || "",
      expires_at: iso(t.expires_in),
      refresh_expires_at: iso(t.refresh_token_expires_in),
    };
    await db.GithubToken.update(row.id, patch);
    return { token: t.access_token, row: { ...row, ...patch } };
  } catch {
    return null;
  }
}

function manifestFor(origin: string) {
  const callbacks = [...new Set([`${PUBLISHED_ORIGIN}/github/callback`, `${origin}/github/callback`])];
  return {
    name: "Handoff by build-swap-ship",
    url: PUBLISHED_ORIGIN,
    description: "Lets builders on Handoff scan the repos they choose (read-only) and prove they own them.",
    public: true,
    redirect_url: `${origin}/github/setup`,
    callback_urls: callbacks,
    setup_url: `${PUBLISHED_ORIGIN}/github/callback`,
    setup_on_update: true,
    request_oauth_on_install: false,
    hook_attributes: { url: `${PUBLISHED_ORIGIN}/github/webhook-unused`, active: false },
    default_permissions: { contents: "read", metadata: "read" },
    default_events: [],
  };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const ctx = createClientFromRequest(req);
    const db = ctx.asServiceRole.entities;
    let me: Row | null = null;
    try { me = await ctx.auth.me(); } catch { me = null; }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const isAdmin = me?.role === "admin";
    const needUser = () => { if (!me?.id) throw new HttpError(401, "Sign in first."); };
    const needAdmin = () => { if (!isAdmin) throw new HttpError(403, "Only an app admin can do that."); };
    const cfg = await getConfig(db);
    const configured = Boolean(cfg?.github_client_id && cfg?.github_client_secret);
    const needConfig = () => { if (!configured) throw new HttpError(503, "GitHub sign-in isn't set up yet."); };

    // ---------- public status ----------
    if (action === "status") {
      const out: Row = {
        configured,
        is_admin: isAdmin,
        slug: configured ? cfg!.github_slug : "",
        install_url: configured ? `https://github.com/apps/${cfg!.github_slug}/installations/new` : "",
        app_url: configured ? cfg!.github_html_url : "",
        connected: false,
      };
      if (me?.id) {
        const ident = items(await db.GithubIdentity.filter({ user_id: me.id }))[0];
        const tok = items(await db.GithubToken.filter({ user_id: me.id }))[0];
        if (ident && tok) {
          out.connected = true;
          out.login = ident.github_login;
          out.avatar_url = ident.avatar_url;
          out.html_url = ident.html_url;
        }
      }
      return Response.json(out);
    }

    // ---------- admin: one-click GitHub App creation (manifest flow) ----------
    if (action === "manifest_start") {
      needAdmin();
      if (!okOrigin(body.origin)) throw new HttpError(400, "Bad origin");
      if (configured && !body.force) throw new HttpError(409, "GitHub sign-in is already set up.");
      const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const patch = { pending_state: state, pending_state_at: new Date().toISOString() };
      if (cfg) await db.AppConfig.update(cfg.id, patch);
      else await db.AppConfig.create({ key: "github_app", ...patch });
      return Response.json({ post_url: `https://github.com/settings/apps/new?state=${state}`, manifest: manifestFor(body.origin) });
    }

    if (action === "manifest_complete") {
      needAdmin();
      const { code, state } = body;
      if (!code || !state || !cfg?.pending_state || cfg.pending_state !== state) throw new HttpError(400, "That setup link doesn't match — start the setup again from Admin.");
      if (Date.now() - Date.parse(cfg.pending_state_at || 0) > 3600_000) throw new HttpError(400, "That setup link expired — start again from Admin.");
      const r = await gh(`/app-manifests/${encodeURIComponent(code)}/conversions`, undefined, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.client_id || !j.client_secret) throw new HttpError(502, j.message || "GitHub didn't return the app credentials — start again from Admin.");
      const slug = j.slug || String(j.html_url || "").split("/apps/")[1] || "";
      await db.AppConfig.update(cfg.id, {
        github_app_id: j.id,
        github_slug: slug,
        github_client_id: j.client_id,
        github_client_secret: j.client_secret,
        github_html_url: j.html_url || `https://github.com/apps/${slug}`,
        github_owner: j.owner?.login || "",
        callback_urls: manifestFor(PUBLISHED_ORIGIN).callback_urls,
        pending_state: "",
        configured_by: me!.id,
        configured_at: new Date().toISOString(),
      });
      // j.pem / j.webhook_secret are not stored: user tokens are all this feature needs.
      return Response.json({ ok: true, slug, name: j.name, html_url: j.html_url });
    }

    // ---------- builder: connect ----------
    if (action === "authorize_url") {
      needUser(); needConfig();
      if (!okOrigin(body.origin) || typeof body.state !== "string" || body.state.length < 16) throw new HttpError(400, "Bad request");
      const redirect = `${body.origin}/github/callback`;
      const allowed: string[] = cfg!.callback_urls?.length ? cfg!.callback_urls : [`${PUBLISHED_ORIGIN}/github/callback`];
      const redirectUri = allowed.includes(redirect) ? redirect : allowed[0];
      const u = new URL("https://github.com/login/oauth/authorize");
      u.searchParams.set("client_id", cfg!.github_client_id);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", body.state);
      return Response.json({ url: u.toString() });
    }

    if (action === "exchange") {
      needUser(); needConfig();
      if (!body.code) throw new HttpError(400, "Missing code");
      const redirect = okOrigin(body.origin) ? `${body.origin}/github/callback` : "";
      const allowed: string[] = cfg!.callback_urls || [];
      const t = await oauthToken(cfg!, { code: String(body.code), ...(allowed.includes(redirect) ? { redirect_uri: redirect } : {}) });
      const ur = await gh("/user", t.access_token);
      const user = await ur.json().catch(() => ({}));
      if (!ur.ok || !user.login) throw new HttpError(502, "Couldn't read your GitHub profile — try again.");

      // One GitHub account per Handoff account, so the verified badge means something.
      const claimed = items(await db.GithubIdentity.filter({ github_id: user.id })).find((r) => r.user_id !== me!.id);
      if (claimed) throw new HttpError(409, `@${user.login} is already linked to another Handoff account.`);

      const identity = { user_id: me!.id, github_id: user.id, github_login: user.login, avatar_url: user.avatar_url || "", html_url: user.html_url || "", connected_at: new Date().toISOString() };
      const token = { user_id: me!.id, github_id: user.id, github_login: user.login, access_token: t.access_token, refresh_token: t.refresh_token || "", expires_at: iso(t.expires_in), refresh_expires_at: iso(t.refresh_token_expires_in) };
      const oldIdent = items(await db.GithubIdentity.filter({ user_id: me!.id }))[0];
      if (oldIdent) await db.GithubIdentity.update(oldIdent.id, identity); else await db.GithubIdentity.create(identity);
      const oldTok = items(await db.GithubToken.filter({ user_id: me!.id }))[0];
      if (oldTok) await db.GithubToken.update(oldTok.id, token); else await db.GithubToken.create(token);
      return Response.json({ ok: true, login: user.login, avatar_url: user.avatar_url });
    }

    // ---------- builder: repos the app may read ----------
    if (action === "repos") {
      needUser(); needConfig();
      const ut = await userToken(db, cfg!, me!.id);
      if (!ut) return Response.json({ connected: false, repos: [] });
      const ir = await gh("/user/installations?per_page=100", ut.token);
      if (ir.status === 401) return Response.json({ connected: false, repos: [] });
      const inst = await ir.json().catch(() => ({}));
      const installations: Row[] = (inst.installations || []).slice(0, 10);
      const repos: Row[] = [];
      for (const i of installations) {
        for (let page = 1; page <= 3; page++) {
          const rr = await gh(`/user/installations/${i.id}/repositories?per_page=100&page=${page}`, ut.token);
          if (!rr.ok) break;
          const data = await rr.json().catch(() => ({}));
          for (const r of data.repositories || []) {
            repos.push({
              full_name: r.full_name,
              private: !!r.private,
              default_branch: r.default_branch,
              pushed_at: r.pushed_at,
              size_kb: r.size,
              description: r.description || "",
              role: r.permissions?.admin ? "owner" : r.permissions?.push ? "collaborator" : "read",
            });
          }
          if ((data.repositories || []).length < 100) break;
        }
      }
      const seen = new Set<string>();
      const unique = repos.filter((r) => (seen.has(r.full_name) ? false : (seen.add(r.full_name), true)));
      unique.sort((a, b) => Date.parse(b.pushed_at || 0) - Date.parse(a.pushed_at || 0));
      return Response.json({ connected: true, login: ut.row.github_login, installations: installations.length, repos: unique });
    }

    if (action === "disconnect") {
      needUser();
      const tok = items(await db.GithubToken.filter({ user_id: me!.id }))[0];
      if (tok && configured) {
        // Revoke the authorization on GitHub's side too (best effort).
        try {
          await fetch(`${GH_API}/applications/${cfg!.github_client_id}/grant`, {
            method: "DELETE",
            headers: { Accept: "application/vnd.github+json", "User-Agent": UA, Authorization: "Basic " + btoa(`${cfg!.github_client_id}:${cfg!.github_client_secret}`), "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: tok.access_token }),
          });
        } catch { /* ignore */ }
      }
      if (tok) await db.GithubToken.delete(tok.id);
      for (const ident of items(await db.GithubIdentity.filter({ user_id: me!.id }))) await db.GithubIdentity.delete(ident.id);
      return Response.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return Response.json({ error: (error as Error).message || "GitHub request failed" }, { status });
  }
}
