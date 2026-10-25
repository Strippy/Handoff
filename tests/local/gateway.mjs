// Local test only: one port that behaves like Supabase (/rest/v1 -> PostgREST, /auth/v1/user) and
// like Vercel (/api/<name> -> the API functions). Lets the real client code run against a local DB.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { verify, SERVICE_KEY } from './jwt.mjs';

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const PGRST = process.env.PGRST_URL || 'http://127.0.0.1:54330';
let dispatch = null;
const STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || '/opt/pgtest/storage';

// What Vercel would provide to the API functions.
process.env.SUPABASE_URL ||= `http://127.0.0.1:${PORT}`;
process.env.SUPABASE_SERVICE_ROLE_KEY ||= SERVICE_KEY;
process.env.APP_URL ||= 'http://localhost:5173';

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/rest/v1/')) {
      const target = PGRST + url.pathname.replace('/rest/v1', '') + url.search;
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['content-length'];
      const r = await fetch(target, { method: req.method, headers, body });
      res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'transfer-encoding'].includes(k))));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    // Storage: signed links for private files (service role only), and serving them.
    const sign = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (sign && req.method === 'POST') {
      if ((req.headers.authorization || '') !== `Bearer ${SERVICE_KEY}`) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'service role only' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ signedURL: `/object/sign/${sign[1]}/${sign[2]}?token=local` }));
      return;
    }
    if (sign && req.method === 'GET') {
      const file = path.join(STORAGE_DIR, decodeURIComponent(sign[1]), decodeURIComponent(sign[2]));
      if (!file.startsWith(STORAGE_DIR + '/') || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (url.pathname === '/auth/v1/user') {
      const claims = verify((req.headers.authorization || '').replace(/^Bearer /i, ''));
      if (!claims?.sub) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 401, msg: 'invalid JWT' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: claims.sub, email: claims.email, aud: 'authenticated', role: 'authenticated', user_metadata: {} }));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!dispatch) ({ dispatch } = await import('../../server/router.ts'));
      const body = await readBody(req);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const r = await dispatch(request);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err?.stack || err) }));
  }
});
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 0;
server.listen(PORT, () => console.log(`gateway on ${PORT}`));
