-- Handoff database: tables, row-level security and server-side guards.
--
-- Rules of thumb used throughout:
--   * Browsers talk to these tables directly with the signed-in user's token, so every table has RLS on.
--   * The API functions use the service role, which bypasses RLS. Anything money- or trust-related
--     (listings' status and deal type, deals, reviews, scans, billing) is written only by them.
--   * Columns a user must not change are protected by triggers, not by trusting the app.

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- The API functions (service role) and database owners.
create or replace function public.is_service() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin')
$$;

create table public.users (
  id text primary key,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())::text and u.role = 'admin'
  )
$$;

create or replace function public.is_privileged() returns boolean
language sql stable set search_path = '' as $$
  select public.is_service() or public.is_admin()
$$;

-- Every signed-up account gets a row in public.users.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- id, created_* and updated_date are set by the database, never by the browser.
create or replace function public.set_meta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if public.is_service() then
      new.id := coalesce(new.id, gen_random_uuid()::text);
      new.created_date := coalesce(new.created_date, now());
    else
      new.id := gen_random_uuid()::text;
      new.created_date := now();
      new.created_by_id := (select auth.uid())::text;
      new.created_by := (select auth.jwt()) ->> 'email';
    end if;
  else
    new.id := old.id;
    new.created_date := old.created_date;
    new.created_by := old.created_by;
    new.created_by_id := old.created_by_id;
  end if;
  new.updated_date := now();
  return new;
end $$;

-- Columns listed in the trigger arguments can only be changed by the API functions or an admin.
create or replace function public.guard_locked_columns() returns trigger
language plpgsql set search_path = '' as $$
declare col text;
begin
  if public.is_privileged() then return new; end if;
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'You can''t change % here.', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- Only the columns listed in the trigger arguments may change (unless API function or admin).
create or replace function public.guard_only_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_privileged() then return new; end if;
  if (to_jsonb(new) - tg_argv - 'updated_date') is distinct from (to_jsonb(old) - tg_argv - 'updated_date') then
    raise exception 'Only % can be changed here.', array_to_string(tg_argv, ', ') using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.app_config (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  callback_urls jsonb,
  configured_at text,
  configured_by text,
  github_app_id double precision,
  github_client_id text,
  github_client_secret text,
  github_html_url text,
  github_owner text,
  github_slug text,
  key text not null,
  pending_state text,
  pending_state_at text,
  price_amount double precision,
  price_currency text,
  pro_enabled boolean default false,
  pro_launched_at text,
  seller_enabled boolean default false,
  seller_launched_at text,
  seller_livemode boolean,
  seller_price_amount double precision,
  seller_price_id text,
  seller_product_id text,
  stripe_livemode boolean,
  stripe_price_id text,
  stripe_product_id text
);

create table public.builder_profile (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  user_id text not null,
  display_name text,
  avatar_url text,
  headline text,
  bio text,
  location text,
  skills jsonb,
  tools jsonb,
  links jsonb,
  open_to_collab boolean default false,
  builders_code_accepted boolean default false,
  founding_builder boolean default false,
  blocked_ids jsonb
);

create table public.conversation (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  participant_key text not null,
  participants jsonb,
  listing_id text,
  listing_title text,
  listing_cover text,
  last_message text,
  last_message_at text,
  last_sender_id text,
  participant_a text,
  participant_b text
);

create table public.deal (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  amount double precision,
  asset_transfer boolean default false,
  buyer_confirmed boolean default false,
  buyer_id text not null,
  buyer_name text,
  cancelled_by text,
  code_transfer boolean default false,
  completed_at text,
  currency text,
  deal_type text,
  delivery jsonb,
  dispute jsonb,
  escrow_set boolean default false,
  escrow_url text,
  handover_notes text,
  inspection_ends_at text,
  keys_rotated boolean default false,
  listing_cover text,
  listing_id text not null,
  listing_title text,
  log jsonb,
  offer_id text,
  received_at text,
  seller_id text not null,
  seller_name text,
  sold boolean default false,
  status text default 'open' check (status in ('open', 'completed', 'cancelled')),
  terms jsonb,
  terms_agreed_buyer_at text,
  terms_agreed_seller_at text,
  terms_hash text,
  terms_set_at text
);

create table public.follow (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  follower_id text not null,
  following_id text not null
);

create table public.github_identity (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  user_id text not null,
  github_id double precision,
  github_login text not null,
  avatar_url text,
  html_url text,
  connected_at text
);

create table public.github_token (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  user_id text not null,
  github_id double precision,
  github_login text,
  access_token text,
  refresh_token text,
  expires_at text,
  refresh_expires_at text
);

create table public.listing (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  ai_tools jsonb,
  category text check (category in ('web_app', 'mobile_app', 'saas', 'game', 'website', 'script_tool', 'extension', 'template', 'api', 'ai_agent', 'other')),
  cover_image text,
  currency text default 'USD' check (currency in ('AUD', 'USD', 'EUR', 'GBP')),
  deal_type text check (deal_type in ('full_sale', 'license', 'collaborator', 'finish_it', 'free_adoption')),
  demo_url text,
  description text,
  feedback_wanted boolean default false,
  gallery jsonb,
  included jsonb,
  known_issues text,
  monthly_costs text,
  open_to_offers boolean default true,
  ownership_attested_at text,
  price double precision,
  reported_revenue text,
  reported_users text,
  scan_grade text,
  scan_id text,
  scan_repo_verified boolean,
  scan_score double precision,
  seller_avatar text,
  seller_id text,
  seller_name text,
  stage text check (stage in ('idea', 'prototype', 'mvp', 'live', 'earning')),
  status text default 'active' check (status in ('active', 'reserved', 'sold', 'archived')),
  tagline text,
  tags jsonb,
  tech_stack jsonb,
  title text not null,
  views double precision default 0,
  what_works text
);

create table public.message (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  conversation_id text not null,
  sender_id text not null,
  sender_name text,
  sender_avatar text,
  recipient_id text,
  body text,
  attachments jsonb,
  read boolean default false
);

create table public.notification (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  user_id text not null,
  type text,
  title text not null,
  body text,
  link text,
  actor_name text,
  actor_avatar text,
  read boolean default false
);

create table public.offer (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  amount double precision,
  buyer_avatar text,
  buyer_id text not null,
  buyer_name text,
  currency text,
  deal_id text,
  listing_cover text,
  listing_id text not null,
  listing_title text,
  message text,
  parent_offer_id text,
  seller_id text not null,
  seller_name text,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined', 'countered', 'withdrawn')),
  timeline text
);

create table public.project_scan (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  ai jsonb,
  ai_status text check (ai_status in ('ok', 'failed')),
  built_on jsonb,
  built_with_ai jsonb,
  checks jsonb,
  connections jsonb,
  env_vars_documented jsonb,
  env_vars_referenced jsonb,
  external_hosts jsonb,
  file_count double precision,
  grade text,
  languages jsonb,
  lines_of_code double precision,
  listing_id text,
  missing jsonb,
  owner_id text not null,
  project_name text,
  published boolean default false,
  repo_url text,
  scanned_at text,
  score double precision,
  secrets_summary jsonb,
  signals jsonb,
  source_file_count double precision,
  source_label text,
  source_type text check (source_type in ('zip', 'github')),
  suggested_included jsonb,
  unity_version text,
  repo_private boolean,
  repo_verified boolean,
  repo_role text check (repo_role in ('owner', 'collaborator', '')),
  verified_github_login text
);

create table public.question (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  listing_id text not null,
  author_id text,
  author_name text,
  author_avatar text,
  body text not null,
  answers jsonb,
  seller_id text
);

create table public.reaction (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  listing_id text not null,
  user_id text not null,
  user_name text,
  type text not null check (type in ('love', 'great_idea', 'could_finish'))
);

create table public.report (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  details text,
  reason text not null,
  reporter_id text,
  reporter_name text,
  status text default 'open' check (status in ('open', 'dismissed', 'actioned')),
  target_id text not null,
  target_label text,
  target_type text not null check (target_type in ('listing', 'builder', 'message', 'deal'))
);

create table public.review (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  body text,
  deal_id text not null,
  listing_id text,
  listing_title text,
  rating double precision,
  reviewee_id text not null,
  reviewer_avatar text,
  reviewer_id text not null,
  reviewer_name text,
  reviewer_role text check (reviewer_role in ('buyer', 'seller'))
);

create table public.saved_listing (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  user_id text not null,
  listing_id text not null
);

create table public.subscription (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  cancel_at_period_end boolean,
  checked_at text,
  current_period_end text,
  email text,
  livemode boolean,
  plan text default 'pro' check (plan in ('pro', 'seller')),
  status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  user_id text not null
);


-- Secret-scan findings (file and line of exposed keys) are visible to the scan's owner only.
create table public.project_scan_private (
  scan_id text primary key references public.project_scan (id) on delete cascade,
  owner_id text not null,
  private_findings jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Constraints and indexes
-- ---------------------------------------------------------------------------------------------

create unique index app_config_key on public.app_config (key);
create unique index builder_profile_user on public.builder_profile (user_id);
create unique index github_identity_user on public.github_identity (user_id);
create unique index github_identity_github on public.github_identity (github_id);
create unique index github_token_user on public.github_token (user_id);
create unique index follow_pair on public.follow (follower_id, following_id);
create unique index saved_listing_pair on public.saved_listing (user_id, listing_id);
create unique index reaction_once on public.reaction (listing_id, user_id, type);
create unique index review_once on public.review (deal_id, reviewer_id);
create unique index subscription_user_plan on public.subscription (user_id, plan);

create index listing_browse on public.listing (status, created_date desc);
create index listing_seller on public.listing (seller_id);
create index offer_listing on public.offer (listing_id);
create index offer_buyer on public.offer (buyer_id);
create index offer_seller on public.offer (seller_id);
create index deal_listing on public.deal (listing_id);
create index deal_buyer on public.deal (buyer_id);
create index deal_seller on public.deal (seller_id);
create index conversation_a on public.conversation (participant_a);
create index conversation_b on public.conversation (participant_b);
create index conversation_key on public.conversation (participant_key, listing_id);
create index message_thread on public.message (conversation_id, created_date);
create index message_unread on public.message (recipient_id) where not read;
create index notification_user on public.notification (user_id, created_date desc);
create index question_listing on public.question (listing_id);
create index reaction_listing on public.reaction (listing_id);
create index review_reviewee on public.review (reviewee_id);
create index follow_following on public.follow (following_id);
create index saved_listing_listing on public.saved_listing (listing_id);
create index project_scan_owner on public.project_scan (owner_id, created_date desc);

alter table public.follow add constraint follow_not_self check (follower_id <> following_id);
alter table public.notification add constraint notification_in_app_link
  check (link is null or link = '' or (left(link, 1) = '/' and left(link, 2) <> '//' and position('\' in link) = 0));

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['app_config', 'builder_profile', 'conversation', 'deal', 'follow', 'github_identity',
    'github_token', 'listing', 'message', 'notification', 'offer', 'project_scan', 'question', 'reaction',
    'report', 'review', 'saved_listing', 'subscription'] loop
    execute format('create trigger a_meta before insert or update on public.%I for each row execute function public.set_meta()', t);
  end loop;
end $$;

create or replace function public.touch_updated() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_date := old.created_date; end if;
  new.updated_date := now();
  return new;
end $$;
create trigger a_touch before insert or update on public.users for each row execute function public.touch_updated();
create trigger a_touch before insert or update on public.project_scan_private for each row execute function public.touch_updated();

create trigger b_guard before update on public.users
  for each row execute function public.guard_only_columns('full_name');
create trigger b_guard before update on public.builder_profile
  for each row execute function public.guard_locked_columns('user_id', 'founding_builder');
create trigger b_guard before update on public.listing
  for each row execute function public.guard_locked_columns('deal_type', 'status', 'seller_id', 'seller_name', 'seller_avatar',
    'views', 'ownership_attested_at', 'scan_grade', 'scan_id', 'scan_repo_verified', 'scan_score');
create trigger b_guard before update on public.conversation
  for each row execute function public.guard_locked_columns('participant_a', 'participant_b', 'participants', 'participant_key', 'listing_id');
create trigger b_guard before update on public.message
  for each row execute function public.guard_only_columns('read');
create trigger b_guard before update on public.notification
  for each row execute function public.guard_only_columns('read');
create trigger b_guard before update on public.offer
  for each row execute function public.guard_only_columns('status', 'buyer_avatar');
create trigger b_guard before update on public.question
  for each row execute function public.guard_locked_columns('listing_id', 'author_id', 'seller_id');

-- Founding Builder badge: the first 100 profiles, decided here rather than by the browser.
create or replace function public.set_founding_builder() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_privileged() then
    new.founding_builder := (select count(*) from public.builder_profile) < 100;
  end if;
  return new;
end $$;
create trigger b_founding before insert on public.builder_profile
  for each row execute function public.set_founding_builder();

-- Offers: people can decline, withdraw or counter a pending offer. Accepting goes through the Deal Room.
create or replace function public.guard_offer_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_privileged() or new.status is not distinct from old.status then return new; end if;
  if old.status <> 'pending' or new.status not in ('declined', 'withdrawn', 'countered') then
    raise exception 'That offer can''t be changed to %.', new.status using errcode = '42501';
  end if;
  return new;
end $$;
create trigger c_offer_status before update on public.offer
  for each row execute function public.guard_offer_status();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.app_config enable row level security;
alter table public.builder_profile enable row level security;
alter table public.conversation enable row level security;
alter table public.deal enable row level security;
alter table public.follow enable row level security;
alter table public.github_identity enable row level security;
alter table public.github_token enable row level security;
alter table public.listing enable row level security;
alter table public.message enable row level security;
alter table public.notification enable row level security;
alter table public.offer enable row level security;
alter table public.project_scan enable row level security;
alter table public.project_scan_private enable row level security;
alter table public.question enable row level security;
alter table public.reaction enable row level security;
alter table public.report enable row level security;
alter table public.review enable row level security;
alter table public.saved_listing enable row level security;
alter table public.subscription enable row level security;

-- Server-only tables: no policies, and no table privileges for browser roles.
revoke all on public.app_config, public.github_token, public.subscription from anon, authenticated;
-- Browsers never write as anon.
revoke insert, update, delete on all tables in schema public from anon;
-- Deals, reviews and scans are written only by the API functions.
revoke insert, update on public.deal, public.review, public.project_scan, public.project_scan_private,
  public.github_identity from authenticated;
revoke insert, delete on public.users from authenticated;

-- users: you see yourself; admins see everyone.
create policy users_read on public.users for select to authenticated
  using (id = (select auth.uid())::text or (select public.is_admin()));
create policy users_update on public.users for update to authenticated
  using (id = (select auth.uid())::text) with check (id = (select auth.uid())::text);

-- builder_profile: public; you edit your own.
create policy builder_profile_read on public.builder_profile for select to anon, authenticated using (true);
create policy builder_profile_insert on public.builder_profile for insert to authenticated
  with check (user_id = (select auth.uid())::text);
create policy builder_profile_update on public.builder_profile for update to authenticated
  using (user_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text or (select public.is_admin()))
  with check (user_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text or (select public.is_admin()));
create policy builder_profile_delete on public.builder_profile for delete to authenticated
  using ((select public.is_admin()));

-- conversation: the two people in it.
create policy conversation_read on public.conversation for select to authenticated
  using ((select auth.uid())::text in (participant_a, participant_b) or (select public.is_admin()));
create policy conversation_insert on public.conversation for insert to authenticated
  with check ((select auth.uid())::text in (participant_a, participant_b) and participant_a <> participant_b);
create policy conversation_update on public.conversation for update to authenticated
  using ((select auth.uid())::text in (participant_a, participant_b))
  with check ((select auth.uid())::text in (participant_a, participant_b));
create policy conversation_delete on public.conversation for delete to authenticated
  using ((select public.is_admin()));

-- deal: the buyer and the seller read it; only the Deal Room function writes it.
create policy deal_read on public.deal for select to authenticated
  using ((select auth.uid())::text in (buyer_id, seller_id) or (select public.is_admin()));
create policy deal_delete on public.deal for delete to authenticated
  using ((select public.is_admin()));

-- follow
create policy follow_read on public.follow for select to anon, authenticated using (true);
create policy follow_insert on public.follow for insert to authenticated
  with check (follower_id = (select auth.uid())::text);
create policy follow_delete on public.follow for delete to authenticated
  using (follower_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text);

-- github_identity: public (it's the verified badge); written by the GitHub function.
create policy github_identity_read on public.github_identity for select to anon, authenticated using (true);

-- listing: public; created and status-changed only through the listing function.
create policy listing_read on public.listing for select to anon, authenticated using (true);
create policy listing_insert on public.listing for insert to authenticated
  with check ((select public.is_admin()));
create policy listing_update on public.listing for update to authenticated
  using (seller_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text or (select public.is_admin()))
  with check (seller_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text or (select public.is_admin()));
create policy listing_delete on public.listing for delete to authenticated
  using (seller_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text or (select public.is_admin()));

-- message: sender and recipient; you can only send as yourself, inside your own conversation.
create policy message_read on public.message for select to authenticated
  using ((select auth.uid())::text in (sender_id, recipient_id) or (select public.is_admin()));
create policy message_insert on public.message for insert to authenticated
  with check (
    sender_id = (select auth.uid())::text
    and recipient_id is not null and recipient_id <> sender_id
    and exists (
      select 1 from public.conversation c
      where c.id = conversation_id
        and sender_id in (c.participant_a, c.participant_b)
        and recipient_id in (c.participant_a, c.participant_b)
    )
  );
create policy message_update on public.message for update to authenticated
  using ((select auth.uid())::text in (sender_id, recipient_id))
  with check ((select auth.uid())::text in (sender_id, recipient_id));
create policy message_delete on public.message for delete to authenticated
  using (sender_id = (select auth.uid())::text or (select public.is_admin()));

-- notification: yours only. Anyone signed in can notify someone, with an in-app link only.
create policy notification_read on public.notification for select to authenticated
  using (user_id = (select auth.uid())::text);
create policy notification_insert on public.notification for insert to authenticated
  with check (user_id is not null);
create policy notification_update on public.notification for update to authenticated
  using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy notification_delete on public.notification for delete to authenticated
  using (user_id = (select auth.uid())::text);

-- offer: buyer and seller. New offers must name the listing's real seller.
create policy offer_read on public.offer for select to authenticated
  using ((select auth.uid())::text in (buyer_id, seller_id) or (select public.is_admin()));
create policy offer_insert on public.offer for insert to authenticated
  with check (
    (select auth.uid())::text in (buyer_id, seller_id)
    and buyer_id <> seller_id
    and status = 'pending'
    and seller_id = (select l.seller_id from public.listing l where l.id = listing_id)
  );
create policy offer_update on public.offer for update to authenticated
  using ((select auth.uid())::text in (buyer_id, seller_id))
  with check ((select auth.uid())::text in (buyer_id, seller_id));
create policy offer_delete on public.offer for delete to authenticated
  using ((select public.is_admin()));

-- project_scan: the owner, or anyone once it's published on a listing.
create policy project_scan_read on public.project_scan for select to anon, authenticated
  using (published or owner_id = (select auth.uid())::text or (select public.is_admin()));
create policy project_scan_delete on public.project_scan for delete to authenticated
  using (owner_id = (select auth.uid())::text or (select public.is_admin()));
create policy project_scan_private_read on public.project_scan_private for select to authenticated
  using (owner_id = (select auth.uid())::text or (select public.is_admin()));

-- question: public Q&A on listings.
create policy question_read on public.question for select to anon, authenticated using (true);
create policy question_insert on public.question for insert to authenticated
  with check (
    author_id = (select auth.uid())::text
    and (seller_id is null or seller_id = (select l.seller_id from public.listing l where l.id = listing_id))
  );
create policy question_update on public.question for update to authenticated
  using ((select auth.uid())::text in (author_id, seller_id, created_by_id) or (select public.is_admin()))
  with check ((select auth.uid())::text in (author_id, seller_id, created_by_id) or (select public.is_admin()));
create policy question_delete on public.question for delete to authenticated
  using (created_by_id = (select auth.uid())::text or author_id = (select auth.uid())::text or (select public.is_admin()));

-- reaction
create policy reaction_read on public.reaction for select to anon, authenticated using (true);
create policy reaction_insert on public.reaction for insert to authenticated
  with check (user_id = (select auth.uid())::text);
create policy reaction_delete on public.reaction for delete to authenticated
  using (user_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text or (select public.is_admin()));

-- report: anyone signed in can report; only admins read and act.
create policy report_insert on public.report for insert to authenticated
  with check ((reporter_id is null or reporter_id = (select auth.uid())::text) and status = 'open');
create policy report_read on public.report for select to authenticated using ((select public.is_admin()));
create policy report_update on public.report for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy report_delete on public.report for delete to authenticated using ((select public.is_admin()));

-- review: public; written by the Deal Room function for completed deals.
create policy review_read on public.review for select to anon, authenticated using (true);
create policy review_delete on public.review for delete to authenticated
  using (reviewer_id = (select auth.uid())::text or (select public.is_admin()));

-- saved_listing
create policy saved_listing_read on public.saved_listing for select to anon, authenticated using (true);
create policy saved_listing_insert on public.saved_listing for insert to authenticated
  with check (user_id = (select auth.uid())::text);
create policy saved_listing_delete on public.saved_listing for delete to authenticated
  using (user_id = (select auth.uid())::text or created_by_id = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- Realtime: new messages arrive live (row-level security still applies).
-- ---------------------------------------------------------------------------------------------
alter publication supabase_realtime add table public.message;
