// Data layer against a real PostgREST + Postgres (tests/local/start.sh), signed in as real roles.
// Checks the Mongo-style filter translation, paging, and that row-level security holds through it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createEntities } from '../../src/api/entities.js';
import { ANON_KEY, SERVICE_KEY, userToken } from '../local/jwt.mjs';

const URL_ = process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321';
const A = '10000000-0000-0000-0000-00000000000a';
const B = '10000000-0000-0000-0000-00000000000b';
const C = '10000000-0000-0000-0000-00000000000c';

const clientFor = (token) =>
  createClient(URL_, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });

const service = createEntities(clientFor(SERVICE_KEY));
const asA = createEntities(clientFor(userToken(A)));
const asB = createEntities(clientFor(userToken(B)));
const asC = createEntities(clientFor(userToken(C)));
const anon = createEntities(clientFor(null));

const svc = clientFor(SERVICE_KEY);

before(async () => {
  // users rows normally come from the auth trigger; the local stub has no auth service, so add them directly.
  const { error } = await svc.from('users').upsert([
    { id: A, email: 'a@test.local', full_name: 'Alice' },
    { id: B, email: 'b@test.local', full_name: 'Bob' },
    { id: C, email: 'c@test.local', full_name: 'Carol' },
  ]);
  if (error) throw error;
  const titles = [
    ['Rocket (beta), "fast" app', 'full_sale', 100, 'mvp'],
    ['Plain todo list', 'collaborator', 0, 'idea'],
    ['Game: dungeon.io', 'license', 250, 'live'],
    ['Back\\slash tool', 'full_sale', 999, 'earning'],
  ];
  for (const [title, deal_type, price, stage] of titles) {
    await service.Listing.create({ title, deal_type, price, stage, status: 'active', seller_id: A, seller_name: 'Alice', currency: 'AUD' });
  }
  await service.Listing.create({ title: 'Archived thing', deal_type: 'full_sale', price: 5, status: 'archived', seller_id: B });
  await service.Conversation.create({ participant_key: `${A}:${B}`, participant_a: A, participant_b: B, participants: [A, B], listing_id: 'x' });
});

test('equality, ranges, $ne and $exists', async () => {
  const active = await anon.Listing.filter({ status: 'active' }, { sort: '-price' });
  assert.equal(active.length, 4);
  assert.deepEqual(active.map((l) => l.price), [999, 250, 100, 0]);
  assert.equal((await anon.Listing.filter({ status: 'active', price: { $lte: 250, $gt: 0 } })).length, 2);
  assert.equal((await anon.Listing.filter({ status: { $ne: 'archived' } })).length, 4);
  assert.equal((await anon.Listing.filter({ scan_score: { $exists: true } })).length, 0);
  assert.equal((await anon.Listing.filter({ deal_type: { $in: ['license', 'collaborator'] } })).length, 2);
  assert.equal((await anon.Listing.filter({ deal_type: { $nin: ['full_sale'] } })).length, 2);
  assert.equal((await anon.Listing.filter({ id: { $in: [] } })).length, 0);
});

test('search text with commas, quotes, parentheses, dots and backslashes', async () => {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const search = (text) =>
    anon.Listing.filter({
      status: 'active',
      $or: [{ title: { $regex: esc(text), $options: 'i' } }, { tagline: { $regex: esc(text), $options: 'i' } }],
    });
  assert.equal((await search('rocket (beta), "fast"')).length, 1);
  assert.equal((await search('DUNGEON.IO')).length, 1);
  assert.equal((await search('back\\slash')).length, 1);
  assert.equal((await search('nothing like this')).length, 0);
});

test('nested $and / $or (the browse page early-access query)', async () => {
  const cutoff = new Date(Date.now() + 60_000).toISOString();
  const rows = await asB.Listing.filter({
    status: 'active',
    $and: [{ $or: [{ title: { $regex: 'app|list', $options: 'i' } }] }, { $or: [{ created_date: { $lte: cutoff } }, { seller_id: B }] }],
  });
  assert.equal(rows.length, 2);
});

test('paging returns has_more and a cursor', async () => {
  const first = await anon.Listing.filter({ status: 'active' }, { sort: '-created_date', limit: 3 });
  assert.equal(first.length, 3);
  assert.equal(first.has_more, true);
  const rest = await anon.Listing.filter({ status: 'active' }, { sort: '-created_date', limit: 3, cursor: first.next_cursor });
  assert.equal(rest.length, 1);
  assert.equal(rest.has_more, false);
  assert.equal(new Set([...first, ...rest].map((r) => r.id)).size, 4);
});

test('list membership on JSON arrays ($in on participants)', async () => {
  assert.equal((await asA.Conversation.filter({ participants: { $in: [A] } })).length, 1);
  assert.equal((await asC.Conversation.filter({ participants: { $in: [C] } })).length, 0);
  // and C can't see A and B's conversation even when asking for it directly
  assert.equal((await asC.Conversation.filter({ participants: { $in: [A] } })).length, 0);
});

test('count, get and not-found', async () => {
  assert.equal(await anon.Listing.count({ status: 'active' }), 4);
  const [one] = await anon.Listing.filter({ status: 'active' }, { limit: 1 });
  assert.equal((await anon.Listing.get(one.id)).id, one.id);
  await assert.rejects(anon.Listing.get('does-not-exist'), (e) => e.status === 404);
});

test('unknown fields and operators are refused', async () => {
  await assert.rejects(anon.Listing.filter({ 'title;drop': 'x' }), /Unknown field/);
  await assert.rejects(anon.Listing.filter({ title: { $where: '1' } }), /Unsupported/);
});

test('writes go through row-level security', async () => {
  const [listing] = await anon.Listing.filter({ status: 'active' }, { limit: 1 });
  const saved = await asC.SavedListing.create({ user_id: C, listing_id: listing.id, extra_field: 'dropped' });
  assert.equal(saved.user_id, C);
  assert.equal(saved.created_by_id, C);
  await assert.rejects(asC.SavedListing.create({ user_id: C, listing_id: listing.id }), (e) => e.status === 409);
  await assert.rejects(asC.SavedListing.create({ user_id: B, listing_id: listing.id }), (e) => e.status === 403);
  await assert.rejects(asB.SavedListing.delete(saved.id), (e) => e.status === 404);
  await asC.SavedListing.delete(saved.id);
  await assert.rejects(asA.Listing.update(listing.id, { status: 'sold' }), (e) => e.status === 403);
  const updated = await asA.Listing.update(listing.id, { tagline: 'Updated by owner' });
  assert.equal(updated.tagline, 'Updated by owner');
  await assert.rejects(asB.Listing.update(listing.id, { tagline: 'hijack' }), (e) => e.status === 404);
  await assert.rejects(asA.Listing.create({ title: 'direct' }), (e) => e.status === 403);
});

test('messages: send, unread counts, mark read with updateMany', async () => {
  const [conv] = await asA.Conversation.filter({ participant_key: `${A}:${B}` });
  await asA.Message.create({ conversation_id: conv.id, sender_id: A, recipient_id: B, body: 'Hi, (is it) still for sale?' });
  await asA.Message.create({ conversation_id: conv.id, sender_id: A, recipient_id: B, body: 'second' });
  assert.equal(await asB.Message.count({ recipient_id: B, read: false }), 2);
  const res = await asB.Message.updateMany({ conversation_id: conv.id, recipient_id: B, read: false }, { $set: { read: true } });
  assert.equal(res.updated, 2);
  assert.equal(await asB.Message.count({ recipient_id: B, read: false }), 0);
  await assert.rejects(asC.Message.create({ conversation_id: conv.id, sender_id: C, recipient_id: A, body: 'spam' }), (e) => e.status === 403);
});

test('scan secret findings: owner sees them, others and anon do not', async () => {
  const scan = await service.ProjectScan.create({ owner_id: A, published: true, score: 77, private_findings: [{ file: '.env', line: 3 }] });
  assert.deepEqual((await asA.ProjectScan.get(scan.id)).private_findings, [{ file: '.env', line: 3 }]);
  assert.equal((await asB.ProjectScan.get(scan.id)).private_findings, null);
  assert.equal((await anon.ProjectScan.get(scan.id)).private_findings, null);
  await assert.rejects(asA.ProjectScan.update(scan.id, { score: 100 }), (e) => e.status === 404 || e.status === 403);
});
