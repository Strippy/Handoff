// End-to-end: real API functions + real PostgREST/Postgres (tests/local/start.sh).
// Covers listing, scanning, the whole Deal Room, reviews, the zip-bomb guards and file ownership.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateRawSync, crc32 } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { createEntities } from '../../src/api/entities.js';
import { ANON_KEY, SERVICE_KEY, userToken } from '../local/jwt.mjs';

const BASE = process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321';
const STORAGE = process.env.LOCAL_STORAGE_DIR || '/opt/pgtest/storage';
const SELLER = '20000000-0000-0000-0000-00000000000a';
const BUYER = '20000000-0000-0000-0000-00000000000b';
const OTHER = '20000000-0000-0000-0000-00000000000c';

const clientFor = (token) =>
  createClient(BASE, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const service = createEntities(clientFor(SERVICE_KEY));
const db = { seller: createEntities(clientFor(userToken(SELLER))), buyer: createEntities(clientFor(userToken(BUYER))) };

async function api(who, name, body) {
  const headers = { 'content-type': 'application/json' };
  if (who) headers.authorization = `Bearer ${userToken(who)}`;
  const r = await fetch(`${BASE}/api/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const ok = (res) => {
  assert.ok(res.status >= 200 && res.status < 300, `expected success, got ${res.status}: ${JSON.stringify(res.data)}`);
  return res.data;
};

function putPrivate(owner, name, bytes) {
  const file = path.join(STORAGE, 'private-files', owner, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return `private-files/${owner}/${name}`;
}

// Minimal zip writer so we can build hostile archives (sizes in headers that lie, etc.).
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, claimSize, crc } of entries) {
    const comp = deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name);
    const size = claimSize ?? data.length;
    const sum = crc ?? crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(sum, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(sum, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

let projectZip;
before(async () => {
  const svc = clientFor(SERVICE_KEY);
  const { error } = await svc.from('users').upsert([
    { id: SELLER, email: 'seller@test.local', full_name: 'Sally Seller' },
    { id: BUYER, email: 'buyer@test.local', full_name: 'Bob Buyer' },
    { id: OTHER, email: 'other@test.local', full_name: 'Olly Other' },
  ]);
  if (error) throw error;
  await db.seller.BuilderProfile.create({ user_id: SELLER, display_name: 'Sally' });
  await db.buyer.BuilderProfile.create({ user_id: BUYER, display_name: 'Bob' });
  // A real project to scan: this repository at HEAD.
  projectZip = execFileSync('git', ['archive', '--format=zip', 'HEAD'], { cwd: path.resolve(import.meta.dirname, '../..'), maxBuffer: 64 << 20 });
});

let listing, scan, deal, uri;

test('seller lists a project through the server (attested, server-owned fields)', async () => {
  const unattested = await api(SELLER, 'listing-sync', { action: 'save', data: { title: 'X' } });
  assert.equal(unattested.status, 400);
  const res = ok(await api(SELLER, 'listing-sync', {
    action: 'save',
    attested: true,
    data: { title: 'Handoff test app', tagline: 'A real repo', cover_image: `${BASE}/storage/v1/object/public/public-files/${SELLER}/cover.png`, deal_type: 'full_sale', price: 500, currency: 'AUD', stage: 'mvp', category: 'web_app', included: ['Source code', 'Domain'], status: 'sold', views: 999 },
  }));
  listing = res.listing;
  assert.equal(listing.status, 'active');
  assert.equal(listing.views, 0);
  assert.equal(listing.seller_id, SELLER);
  assert.ok(listing.ownership_attested_at);
  const view = ok(await api(BUYER, 'listing-sync', { action: 'view', listing_id: listing.id }));
  assert.equal(view.counted, true);
});

test('seller scans their zip; someone else cannot use that file', async () => {
  uri = putPrivate(SELLER, 'project.zip', projectZip);
  const stolen = await api(OTHER, 'scan-project', { file_uri: uri, file_name: 'project.zip' });
  assert.equal(stolen.status, 400);
  const res = await api(SELLER, 'scan-project', { file_uri: uri, file_name: 'project.zip' });
  scan = ok(res).scan || ok(res);
  assert.ok(scan.id, `scan id missing: ${JSON.stringify(res.data).slice(0, 300)}`);
  assert.ok(scan.score > 0 && scan.score <= 100);
  assert.ok(scan.file_count > 50, `file_count ${scan.file_count}`);
  ok(await api(SELLER, 'scan-project', { action: 'attach', listing_id: listing.id, scan_id: scan.id }));
  const fresh = await service.Listing.get(listing.id);
  assert.equal(fresh.scan_id, scan.id);
  assert.equal(fresh.scan_score, scan.score);
});

test('zip bombs and lying headers are handled safely and fast', async () => {
  // 320 MB of zeros in one binary file: never inflated (only small text files are read), so it's harmless.
  const big = makeZip([{ name: 'zeros.bin', data: Buffer.alloc(320 << 20) }]);
  // A "small" text file whose header lies about its size: rejected as tampered.
  const liar = makeZip([{ name: 'small.txt', data: Buffer.alloc(40 << 20, 0x61), claimSize: 1000 }]);
  // Thousands of honest small text files adding up to far more than the reading budget.
  const wide = makeZip(Array.from({ length: 1200 }, (_, i) => ({ name: `src/f${i}.js`, data: Buffer.alloc(300 << 10, 0x61) })));
  for (const [name, bytes, mustReject] of [['big.zip', big, false], ['liar.zip', liar, true], ['wide.zip', wide, false]]) {
    const t0 = Date.now();
    const res = await api(SELLER, 'scan-project', { file_uri: putPrivate(SELLER, name, bytes), file_name: name });
    const took = Date.now() - t0;
    assert.ok(res.status < 500, `${name}: ${res.status} ${JSON.stringify(res.data)}`);
    if (mustReject) assert.ok(res.status >= 400, `${name} should be rejected, got ${res.status}`);
    assert.ok(took < 25000, `${name} took ${took}ms`);
  }
});

test('offer → Deal Room → sold, with each side limited to its own steps', async () => {
  const offer = await db.buyer.Offer.create({ listing_id: listing.id, buyer_id: BUYER, seller_id: SELLER, amount: 450, currency: 'AUD', buyer_name: 'Bob' });
  assert.equal((await api(BUYER, 'deal-room', { action: 'accept_offer', offer_id: offer.id })).status, 403);
  assert.equal((await api(SELLER, 'deal-room', { action: 'accept_offer', offer_id: offer.id, expected_amount: 1 })).status, 409);
  deal = ok(await api(SELLER, 'deal-room', { action: 'accept_offer', offer_id: offer.id, expected_amount: 450 })).deal;
  assert.equal((await service.Listing.get(listing.id)).status, 'reserved');
  assert.equal((await api(OTHER, 'deal-room', { action: 'notes', deal_id: deal.id, notes: 'x' })).status, 403);

  const step = (who, action, extra = {}) => api(who, 'deal-room', { action, deal_id: deal.id, ...extra });
  assert.equal((await step(SELLER, 'escrow', { url: 'https://www.escrow.com/transaction/1' })).status, 409);
  deal = ok(await step(SELLER, 'set_terms', { included: ['Source code', 'Domain'], criteria: 'App builds with npm run build and the login works.', inspection_days: 3 })).deal;
  ok(await step(BUYER, 'agree_terms', { terms_hash: deal.terms_hash }));
  deal = ok(await step(SELLER, 'agree_terms', { terms_hash: deal.terms_hash })).deal;
  assert.equal((await step(SELLER, 'escrow', { url: 'https://escrow-com.example/pay' })).status, 400);
  ok(await step(SELLER, 'escrow', { url: 'https://www.escrow.com/transaction/12345' }));
  assert.equal((await step(BUYER, 'step', { key: 'escrow_set', value: true })).status, 403);
  ok(await step(SELLER, 'step', { key: 'escrow_set', value: true }));

  const delivered = ok(await api(SELLER, 'scan-project', { action: 'delivery', deal_id: deal.id, file_uri: uri, file_name: 'project.zip' }));
  assert.ok(delivered.deal?.delivery?.sha256 || delivered.delivery?.sha256, JSON.stringify(delivered).slice(0, 300));
  ok(await step(BUYER, 'received'));
  assert.equal((await step(BUYER, 'cancel')).status, 409);
  const link = ok(await step(BUYER, 'delivery_link'));
  assert.match(link.url || link.signed_url || '', /private-files/);

  assert.equal((await step(SELLER, 'step', { key: 'sold', value: true })).status, 409);
  ok(await step(SELLER, 'step', { key: 'keys_rotated', value: true }));
  assert.equal((await step(SELLER, 'step', { key: 'buyer_confirmed', value: true })).status, 403);
  ok(await step(BUYER, 'step', { key: 'buyer_confirmed', value: true }));
  deal = ok(await step(SELLER, 'step', { key: 'sold', value: true })).deal;
  assert.equal(deal.status, 'completed');
  assert.equal((await service.Listing.get(listing.id)).status, 'sold');

  ok(await step(BUYER, 'review', { rating: 5, body: 'Smooth handover.' }));
  assert.equal((await step(BUYER, 'review', { rating: 1, body: 'again' })).status, 409);
  const reviews = await db.seller.Review.filter({ reviewee_id: SELLER });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].rating, 5);
});

test('billing answers for anon and signed-in users', async () => {
  const anon = ok(await api(null, 'billing', { action: 'status' }));
  assert.equal(anon.pro_enabled, false);
  const mine = ok(await api(SELLER, 'billing', { action: 'status' }));
  assert.equal(mine.is_admin, false);
  const lic = ok(await api(null, 'billing', { action: 'seller_licence', user_id: SELLER }));
  assert.equal(lic.enabled, false);
  assert.equal((await api(SELLER, 'billing', { action: 'admin_status' })).status, 403);
});

test('unknown routes and methods', async () => {
  assert.equal((await api(SELLER, 'nope', {})).status, 404);
  const r = await fetch(`${BASE}/api/billing`);
  assert.equal(r.status, 405);
});
