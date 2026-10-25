// Local test only: signs HS256 tokens the way Supabase Auth does, for PostgREST and the mock auth endpoint.
import { createHmac } from 'node:crypto';

export const JWT_SECRET = process.env.LOCAL_JWT_SECRET || 'local-test-secret-local-test-secret-0123456789';
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function sign(claims, secret = JWT_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iat: now, exp: now + 3600, aud: 'authenticated', ...claims });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verify(token, secret = JWT_SECRET) {
  const [head, body, sig] = String(token || '').split('.');
  if (!head || !body || !sig) return null;
  const want = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  if (want !== sig) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}

export const userToken = (id, email = `${id}@test.local`) => sign({ sub: id, role: 'authenticated', email });
export const ANON_KEY = sign({ role: 'anon' });
export const SERVICE_KEY = sign({ role: 'service_role' });
