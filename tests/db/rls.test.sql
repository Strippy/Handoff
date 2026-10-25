-- Row-level security and guard tests. Run on a throwaway database after supabase-stubs.sql and the
-- migrations: psql -v ON_ERROR_STOP=1 -f tests/db/rls.test.sql
-- Each check runs as a real browser role (anon / authenticated) with a JWT claim, like PostgREST does.

\set QUIET on
\o /dev/null
set client_min_messages = warning;

create schema if not exists t;
create table if not exists t.results (name text, ok boolean, detail text);
truncate t.results;

-- Run sql as a user; record whether it succeeded or failed as expected.
create or replace function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, true);
  perform set_config('request.jwt.claims',
    case when uid is null then '{"role":"anon"}'
    else json_build_object('sub', uid, 'role', 'authenticated', 'email', uid::text || '@test.local')::text end, true);
end $$;

create or replace function t.check(name text, uid uuid, sql text, expect_ok boolean) returns void language plpgsql as $$
declare ok boolean := true; detail text := '';
begin
  begin
    perform t.as_user(uid);
    execute sql;
    reset role;
  exception when others then
    reset role;
    ok := false; detail := sqlerrm;
  end;
  insert into t.results values (name, ok = expect_ok, case when ok = expect_ok then '' else coalesce(nullif(detail, ''), 'succeeded but should have failed') end);
end $$;

-- Count rows visible to a user.
create or replace function t.visible(uid uuid, sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform t.as_user(uid);
  execute 'select count(*) from (' || sql || ') q' into n;
  reset role;
  return n;
end $$;

create or replace function t.expect(name text, got bigint, want bigint) returns void language sql as $$
  insert into t.results values (name, got = want, format('got %s, want %s', got, want));
$$;

-- Fixtures (as the database owner) -------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.local'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local');
update public.users set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''
\set AD '''00000000-0000-0000-0000-0000000000ad'''

set role service_role;
insert into public.listing (id, title, seller_id, deal_type, status, price, currency)
  values ('L1', 'Alice app', :A, 'full_sale', 'active', 500, 'AUD');
insert into public.conversation (id, participant_key, participant_a, participant_b, participants, listing_id)
  values ('C1', 'k', :A, :B, jsonb_build_array(:A, :B), 'L1');
insert into public.deal (id, listing_id, buyer_id, seller_id, amount) values ('D1', 'L1', :B, :A, 500);
insert into public.project_scan (id, owner_id, published, score) values ('S1', :A, false, 80), ('S2', :A, true, 90);
insert into public.project_scan_private (scan_id, owner_id, private_findings) values ('S1', :A, '[{"file":".env"}]');
insert into public.offer (id, listing_id, buyer_id, seller_id, amount, status) values ('O1', 'L1', :B, :A, 400, 'pending');
insert into public.app_config (key, stripe_price_id) values ('billing', 'price_x');
insert into public.subscription (user_id, status) values (:A, 'active');
reset role;

-- users ---------------------------------------------------------------------------------------
select t.expect('users: auth trigger made 4 rows', (select count(*) from public.users), 4);
select t.expect('users: I see only myself', t.visible(:A, 'select * from public.users'), 1);
select t.expect('users: admin sees all', t.visible(:AD, 'select * from public.users'), 4);
select t.check('users: rename myself', :A, $$update public.users set full_name = 'Alice' where id = '00000000-0000-0000-0000-00000000000a'$$, true);
select t.check('users: cannot make myself admin', :A, $$update public.users set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a'$$, false);

-- server-only tables ---------------------------------------------------------------------------
select t.check('app_config: hidden from users', :A, 'select * from public.app_config', false);
select t.check('subscription: hidden from users', :A, 'select * from public.subscription', false);
select t.check('github_token: hidden from users', :A, 'select * from public.github_token', false);
select t.check('app_config: hidden from admin browser too', :AD, 'select * from public.app_config', false);

-- listing ---------------------------------------------------------------------------------------
select t.expect('listing: anon can browse', t.visible(null, 'select * from public.listing'), 1);
select t.check('listing: users cannot create directly', :A, $$insert into public.listing (title, seller_id) values ('x', '00000000-0000-0000-0000-00000000000a')$$, false);
select t.check('listing: seller edits copy', :A, $$update public.listing set tagline = 'new' where id = 'L1'$$, true);
select t.check('listing: seller cannot change status', :A, $$update public.listing set status = 'sold' where id = 'L1'$$, false);
select t.check('listing: seller cannot change deal type', :A, $$update public.listing set deal_type = 'license' where id = 'L1'$$, false);
select t.check('listing: seller cannot fake a scan score', :A, $$update public.listing set scan_score = 100 where id = 'L1'$$, false);
select t.check('listing: seller cannot bump views', :A, $$update public.listing set views = 9999 where id = 'L1'$$, false);
select t.expect('listing: others cannot edit (no rows)', t.visible(:B, $$select 1 from public.listing where id = 'L1' and false$$), 0);
select t.check('listing: admin can archive', :AD, $$update public.listing set status = 'archived' where id = 'L1'$$, true);
set role service_role; update public.listing set status = 'active' where id = 'L1'; reset role;
select t.check('listing: meta columns are not spoofable', :A, $$update public.listing set created_by_id = 'x', id = 'L9' where id = 'L1'$$, true);
select t.expect('listing: id unchanged after spoof attempt', (select count(*) from public.listing where id = 'L1'), 1);

-- deal ------------------------------------------------------------------------------------------
select t.expect('deal: buyer sees it', t.visible(:B, 'select * from public.deal'), 1);
select t.expect('deal: seller sees it', t.visible(:A, 'select * from public.deal'), 1);
select t.expect('deal: outsider does not', t.visible(:C, 'select * from public.deal'), 0);
select t.check('deal: buyer cannot tick steps', :B, $$update public.deal set buyer_confirmed = true, sold = true where id = 'D1'$$, false);
select t.check('deal: seller cannot tick steps', :A, $$update public.deal set sold = true where id = 'D1'$$, false);
select t.check('deal: nobody can create one directly', :B, $$insert into public.deal (listing_id, buyer_id, seller_id) values ('L1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a')$$, false);
select t.check('review: nobody can write one directly', :B, $$insert into public.review (deal_id, reviewer_id, reviewee_id, rating) values ('D1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 5)$$, false);

-- offer -----------------------------------------------------------------------------------------
select t.check('offer: buyer makes an offer', :C, $$insert into public.offer (listing_id, buyer_id, seller_id, amount) values ('L1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 450)$$, true);
select t.check('offer: cannot name a fake seller', :C, $$insert into public.offer (listing_id, buyer_id, seller_id, amount) values ('L1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 450)$$, false);
select t.check('offer: cannot offer as someone else', :C, $$insert into public.offer (listing_id, buyer_id, seller_id, amount) values ('L1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 1)$$, false);
select t.check('offer: cannot start as accepted', :C, $$insert into public.offer (listing_id, buyer_id, seller_id, amount, status) values ('L1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 450, 'accepted')$$, false);
select t.check('offer: buyer cannot change the amount', :B, $$update public.offer set amount = 1 where id = 'O1'$$, false);
select t.check('offer: seller cannot accept outside the Deal Room', :A, $$update public.offer set status = 'accepted' where id = 'O1'$$, false);
select t.check('offer: seller can decline', :A, $$update public.offer set status = 'declined' where id = 'O1'$$, true);
select t.check('offer: declined offer cannot be reopened', :B, $$update public.offer set status = 'pending' where id = 'O1'$$, false);
select t.expect('offer: outsider sees none of B''s offers', t.visible(:C, $$select * from public.offer where buyer_id = '00000000-0000-0000-0000-00000000000b'$$), 0);

-- conversation + message ------------------------------------------------------------------------
select t.expect('conversation: participants see it', t.visible(:B, 'select * from public.conversation'), 1);
select t.expect('conversation: outsider does not', t.visible(:C, 'select * from public.conversation'), 0);
select t.check('conversation: cannot be hijacked', :B, $$update public.conversation set participant_a = '00000000-0000-0000-0000-00000000000c' where id = 'C1'$$, false);
select t.check('conversation: last message can update', :B, $$update public.conversation set last_message = 'hi' where id = 'C1'$$, true);
select t.check('message: send in my conversation', :B, $$insert into public.message (conversation_id, sender_id, recipient_id, body) values ('C1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'hi')$$, true);
select t.check('message: cannot send as someone else', :B, $$insert into public.message (conversation_id, sender_id, recipient_id, body) values ('C1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'fake')$$, false);
select t.check('message: cannot post into a stranger''s conversation', :C, $$insert into public.message (conversation_id, sender_id, recipient_id, body) values ('C1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'spam')$$, false);
select t.check('message: recipient marks read', :A, $$update public.message set read = true where conversation_id = 'C1'$$, true);
select t.check('message: recipient cannot rewrite the text', :A, $$update public.message set body = 'edited' where conversation_id = 'C1'$$, false);
select t.expect('message: outsider sees nothing', t.visible(:C, 'select * from public.message'), 0);

-- notification ----------------------------------------------------------------------------------
select t.check('notification: notify someone with an in-app link', :B, $$insert into public.notification (user_id, title, link) values ('00000000-0000-0000-0000-00000000000a', 'New message', '/messages/C1')$$, true);
select t.check('notification: outside links are refused', :B, $$insert into public.notification (user_id, title, link) values ('00000000-0000-0000-0000-00000000000a', 'Click', 'https://evil.example')$$, false);
select t.check('notification: protocol-relative links are refused', :B, $$insert into public.notification (user_id, title, link) values ('00000000-0000-0000-0000-00000000000a', 'Click', '//evil.example')$$, false);
select t.expect('notification: only the recipient sees it', t.visible(:B, 'select * from public.notification'), 0);
select t.expect('notification: recipient sees it', t.visible(:A, 'select * from public.notification'), 1);
select t.check('notification: recipient cannot rewrite it', :A, $$update public.notification set title = 'x'$$, false);
select t.check('notification: recipient marks read', :A, $$update public.notification set read = true$$, true);
select t.expect('notification: sender recorded', (select count(*) from public.notification where created_by_id = '00000000-0000-0000-0000-00000000000b'), 1);

-- project scans ---------------------------------------------------------------------------------
select t.expect('scan: anon sees only published', t.visible(null, 'select * from public.project_scan'), 1);
select t.expect('scan: owner sees both', t.visible(:A, 'select * from public.project_scan'), 2);
select t.expect('scan: secret findings hidden from others', t.visible(:B, 'select * from public.project_scan_private'), 0);
select t.expect('scan: secret findings visible to owner', t.visible(:A, 'select * from public.project_scan_private'), 1);
select t.check('scan: owner cannot edit the score', :A, $$update public.project_scan set score = 100 where id = 'S1'$$, false);

-- profiles, follows, saves, reactions, questions, reports --------------------------------------
select t.check('profile: create my own', :C, $$insert into public.builder_profile (user_id, display_name, founding_builder) values ('00000000-0000-0000-0000-00000000000c', 'Carol', false)$$, true);
select t.expect('profile: founding badge set by the database', (select count(*) from public.builder_profile where founding_builder), 1);
select t.check('profile: cannot create one for someone else', :C, $$insert into public.builder_profile (user_id) values ('00000000-0000-0000-0000-00000000000a')$$, false);
select t.check('profile: cannot remove founding badge from myself or fake it', :C, $$update public.builder_profile set founding_builder = false where user_id = '00000000-0000-0000-0000-00000000000c'$$, false);
select t.check('profile: edit my bio', :C, $$update public.builder_profile set bio = 'hi' where user_id = '00000000-0000-0000-0000-00000000000c'$$, true);
select t.check('follow: follow someone', :C, $$insert into public.follow (follower_id, following_id) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a')$$, true);
select t.check('follow: cannot follow on someone else''s behalf', :C, $$insert into public.follow (follower_id, following_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a')$$, false);
select t.check('save: save a listing', :C, $$insert into public.saved_listing (user_id, listing_id) values ('00000000-0000-0000-0000-00000000000c', 'L1')$$, true);
select t.check('reaction: react', :C, $$insert into public.reaction (listing_id, user_id, type) values ('L1', '00000000-0000-0000-0000-00000000000c', 'love')$$, true);
select t.check('reaction: cannot react as someone else', :C, $$insert into public.reaction (listing_id, user_id, type) values ('L1', '00000000-0000-0000-0000-00000000000b', 'love')$$, false);
select t.check('question: ask the real seller', :C, $$insert into public.question (listing_id, author_id, seller_id, body) values ('L1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'Does it work?')$$, true);
select t.check('question: cannot claim to be the seller', :C, $$insert into public.question (listing_id, author_id, seller_id, body) values ('L1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'x')$$, false);
select t.check('question: seller answers', :A, $$update public.question set answers = '[{"body":"yes"}]' where listing_id = 'L1'$$, true);
select t.check('report: file a report', :C, $$insert into public.report (target_type, target_id, reason, reporter_id) values ('listing', 'L1', 'spam', '00000000-0000-0000-0000-00000000000c')$$, true);
select t.expect('report: reporters cannot read the queue', t.visible(:C, 'select * from public.report'), 0);
select t.expect('report: admin reads the queue', t.visible(:AD, 'select * from public.report'), 1);
select t.check('anon: cannot write anything', null, $$insert into public.saved_listing (user_id, listing_id) values ('x', 'L1')$$, false);

\o
-- Results ----------------------------------------------------------------------------------------
\set QUIET off
select name, detail from t.results where not ok;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
do $$ begin if exists (select 1 from t.results where not ok) then raise exception 'RLS tests failed'; end if; end $$;
