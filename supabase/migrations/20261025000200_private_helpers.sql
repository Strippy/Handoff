-- Keep helper and trigger functions out of the public API.
-- Anything in the public schema can be called through /rest/v1/rpc/<name>; these are internal, so
-- they move to a private schema. Policies and triggers point at the functions themselves, so they
-- keep working; the bodies are re-created to call each other in their new home.

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_service() set schema private;
alter function public.is_admin() set schema private;
alter function public.is_privileged() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.set_meta() set schema private;
alter function public.guard_locked_columns() set schema private;
alter function public.guard_only_columns() set schema private;
alter function public.touch_updated() set schema private;
alter function public.set_founding_builder() set schema private;
alter function public.guard_offer_status() set schema private;

create or replace function private.is_privileged() returns boolean
language sql stable set search_path = '' as $$
  select private.is_service() or private.is_admin()
$$;

create or replace function private.set_meta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if private.is_service() then
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

create or replace function private.guard_locked_columns() returns trigger
language plpgsql set search_path = '' as $$
declare col text;
begin
  if private.is_privileged() then return new; end if;
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'You can''t change % here.', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create or replace function private.guard_only_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_privileged() then return new; end if;
  if (to_jsonb(new) - tg_argv - 'updated_date') is distinct from (to_jsonb(old) - tg_argv - 'updated_date') then
    raise exception 'Only % can be changed here.', array_to_string(tg_argv, ', ') using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.set_founding_builder() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.is_privileged() then
    new.founding_builder := (select count(*) from public.builder_profile) < 100;
  end if;
  return new;
end $$;

create or replace function private.guard_offer_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_privileged() or new.status is not distinct from old.status then return new; end if;
  if old.status <> 'pending' or new.status not in ('declined', 'withdrawn', 'countered') then
    raise exception 'That offer can''t be changed to %.', new.status using errcode = '42501';
  end if;
  return new;
end $$;

-- Trigger functions are never called directly.
revoke execute on function private.handle_new_user(), private.set_meta(), private.guard_locked_columns(),
  private.guard_only_columns(), private.touch_updated(), private.set_founding_builder(), private.guard_offer_status()
  from public, anon, authenticated;
