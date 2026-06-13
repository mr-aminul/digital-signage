-- Denormalize storage usage, enforce quota at insert, paginate admin directory.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists storage_used_bytes bigint not null default 0;

alter table public.profiles
  drop constraint if exists profiles_storage_used_non_negative;

alter table public.profiles
  add constraint profiles_storage_used_non_negative check (storage_used_bytes >= 0);

comment on column public.profiles.storage_used_bytes is
  'Running total of media.size_bytes for this client; maintained by trigger.';

-- Backfill from media rows (source of truth before triggers take over).
update public.profiles p
set storage_used_bytes = coalesce((
  select sum(m.size_bytes)::bigint
  from public.media m
  where m.owner_id = p.id
), 0);

-- ---------------------------------------------------------------------------
-- Counter sync on media changes
-- ---------------------------------------------------------------------------

create or replace function public.sync_profile_storage_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_owner uuid;
  v_new_owner uuid;
  v_old_bytes bigint;
  v_new_bytes bigint;
begin
  if tg_op = 'INSERT' then
    v_new_owner := new.owner_id;
    v_new_bytes := coalesce(new.size_bytes, 0);
    if v_new_owner is not null and v_new_bytes <> 0 then
      update public.profiles
      set storage_used_bytes = storage_used_bytes + v_new_bytes
      where id = v_new_owner;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    v_old_owner := old.owner_id;
    v_old_bytes := coalesce(old.size_bytes, 0);
    if v_old_owner is not null and v_old_bytes <> 0 then
      update public.profiles
      set storage_used_bytes = greatest(0, storage_used_bytes - v_old_bytes)
      where id = v_old_owner;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    v_old_owner := old.owner_id;
    v_new_owner := new.owner_id;
    v_old_bytes := coalesce(old.size_bytes, 0);
    v_new_bytes := coalesce(new.size_bytes, 0);

    if v_old_owner is distinct from v_new_owner then
      if v_old_owner is not null and v_old_bytes <> 0 then
        update public.profiles
        set storage_used_bytes = greatest(0, storage_used_bytes - v_old_bytes)
        where id = v_old_owner;
      end if;
      if v_new_owner is not null and v_new_bytes <> 0 then
        update public.profiles
        set storage_used_bytes = storage_used_bytes + v_new_bytes
        where id = v_new_owner;
      end if;
    elsif v_new_owner is not null and v_old_bytes is distinct from v_new_bytes then
      update public.profiles
      set storage_used_bytes = greatest(0, storage_used_bytes + (v_new_bytes - v_old_bytes))
      where id = v_new_owner;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists media_sync_profile_storage_used on public.media;
create trigger media_sync_profile_storage_used
  after insert or update of owner_id, size_bytes or delete on public.media
  for each row
  execute function public.sync_profile_storage_used();

-- ---------------------------------------------------------------------------
-- Quota enforcement at insert / size increase
-- ---------------------------------------------------------------------------

create or replace function public.enforce_media_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit bigint;
  v_used bigint;
  v_add bigint;
begin
  if new.owner_id is null then
    raise exception 'Missing owner id';
  end if;

  if new.size_bytes is null or new.size_bytes < 0 then
    raise exception 'invalid_file_size';
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.size_bytes, 0) >= coalesce(new.size_bytes, 0)
       and old.owner_id is not distinct from new.owner_id then
      return new;
    end if;
    v_add := greatest(0, coalesce(new.size_bytes, 0) - coalesce(old.size_bytes, 0));
  else
    v_add := coalesce(new.size_bytes, 0);
  end if;

  if v_add = 0 then
    return new;
  end if;

  select p.storage_limit_bytes, p.storage_used_bytes
  into v_limit, v_used
  from public.profiles p
  where p.id = new.owner_id
  for update;

  if v_limit is null then
    raise exception 'owner_not_found';
  end if;

  if v_used + v_add > v_limit then
    raise exception 'storage_limit_reached';
  end if;

  return new;
end;
$$;

drop trigger if exists media_enforce_storage_quota on public.media;
create trigger media_enforce_storage_quota
  before insert or update of owner_id, size_bytes on public.media
  for each row
  execute function public.enforce_media_storage_quota();

-- ---------------------------------------------------------------------------
-- Storage helpers (counter-based)
-- ---------------------------------------------------------------------------

create or replace function public.get_owner_storage_used(p_owner_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_used bigint;
begin
  if p_owner_id is null then
    raise exception 'Missing owner id';
  end if;

  if auth.uid() is distinct from p_owner_id
     and not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  select p.storage_used_bytes
  into v_used
  from public.profiles p
  where p.id = p_owner_id;

  if v_used is null then
    raise exception 'owner_not_found';
  end if;

  return v_used;
end;
$$;

revoke all on function public.get_owner_storage_used(uuid) from public;
grant execute on function public.get_owner_storage_used(uuid) to authenticated;

create or replace function public.check_storage_quota(p_owner_id uuid, p_add_bytes bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit bigint;
  v_used bigint;
begin
  if p_owner_id is null then
    raise exception 'Missing owner id';
  end if;

  if auth.uid() is distinct from p_owner_id
     and not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  if p_add_bytes is null or p_add_bytes < 0 then
    raise exception 'invalid_file_size';
  end if;

  select p.storage_limit_bytes, p.storage_used_bytes
  into v_limit, v_used
  from public.profiles p
  where p.id = p_owner_id
  for update;

  if v_limit is null then
    raise exception 'owner_not_found';
  end if;

  if v_used + p_add_bytes > v_limit then
    raise exception 'storage_limit_reached';
  end if;
end;
$$;

revoke all on function public.check_storage_quota(uuid, bigint) from public;
grant execute on function public.check_storage_quota(uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- JWT app_metadata sync (middleware reads without DB round-trip)
-- ---------------------------------------------------------------------------

create or replace function public.sync_user_app_metadata(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_disabled boolean := false;
  v_staff boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  select coalesce(p.is_disabled, false)
  into v_disabled
  from public.profiles p
  where p.id = p_user_id;

  select exists (
    select 1
    from public.platform_staff s
    where s.user_id = p_user_id
      and s.is_active
  )
  into v_staff;

  update auth.users u
  set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'is_disabled', v_disabled,
      'is_platform_staff', v_staff
    )
  where u.id = p_user_id;
end;
$$;

revoke all on function public.sync_user_app_metadata(uuid) from public;
grant execute on function public.sync_user_app_metadata(uuid) to authenticated;

-- Backfill JWT flags for existing users.
do $$
declare
  r record;
begin
  for r in select p.id from public.profiles p loop
    perform public.sync_user_app_metadata(r.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account disable: sync JWT + re-apply device quota on re-enable
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_account_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if exists (
    select 1
    from public.platform_staff s
    where s.user_id = p_user_id
      and s.is_active
  ) then
    raise exception 'Cannot disable platform staff accounts';
  end if;

  update public.profiles
  set is_disabled = p_disabled
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;

  if p_disabled then
    update public.devices
    set playback_disabled = true
    where owner_id = p_user_id;
  else
    select p.device_limit
    into v_limit
    from public.profiles p
    where p.id = p_user_id;

    perform public.apply_device_quota(p_user_id, coalesce(v_limit, 1), null);
  end if;

  perform public.sync_user_app_metadata(p_user_id);
end;
$$;

revoke all on function public.admin_set_account_disabled(uuid, boolean) from public;
grant execute on function public.admin_set_account_disabled(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin directory: stats + paginated list
-- ---------------------------------------------------------------------------

create or replace function public.admin_directory_stats()
returns table (
  client_count bigint,
  device_count bigint,
  online_device_count bigint,
  disabled_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    count(distinct p.id) as client_count,
    count(d.id) as device_count,
    count(d.id) filter (where d.status = 'online') as online_device_count,
    count(distinct p.id) filter (where p.is_disabled) as disabled_count
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  where u.is_anonymous = false
    and u.email is not null;
end;
$$;

revoke all on function public.admin_directory_stats() from public;
grant execute on function public.admin_directory_stats() to authenticated;

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  email text,
  client_name text,
  created_at timestamptz,
  device_count bigint,
  online_device_count bigint,
  active_device_count bigint,
  device_limit integer,
  storage_used_bytes bigint,
  storage_limit_bytes bigint,
  is_disabled boolean,
  is_staff boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  if v_status not in ('all', 'active', 'disabled') then
    raise exception 'invalid_status_filter';
  end if;

  if v_limit > 200 then
    v_limit := 200;
  end if;

  return query
  with filtered as (
    select
      p.id,
      u.email::text as email,
      p.client_name,
      p.created_at,
      count(d.id) as device_count,
      count(d.id) filter (where d.status = 'online') as online_device_count,
      count(d.id) filter (where not d.paused_by_quota and not d.playback_disabled) as active_device_count,
      p.device_limit,
      p.storage_used_bytes,
      p.storage_limit_bytes,
      p.is_disabled,
      exists (
        select 1
        from public.platform_staff s
        where s.user_id = p.id
          and s.is_active
      ) as is_staff
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.devices d on d.owner_id = p.id
    where u.is_anonymous = false
      and u.email is not null
      and (
        v_status = 'all'
        or (v_status = 'active' and not p.is_disabled)
        or (v_status = 'disabled' and p.is_disabled)
      )
      and (
        v_search is null
        or lower(u.email) like '%' || lower(v_search) || '%'
        or lower(coalesce(p.client_name, '')) like '%' || lower(v_search) || '%'
      )
    group by
      p.id,
      u.email,
      p.client_name,
      p.created_at,
      p.device_limit,
      p.storage_used_bytes,
      p.storage_limit_bytes,
      p.is_disabled
  )
  select
    f.id,
    f.email,
    f.client_name,
    f.created_at,
    f.device_count,
    f.online_device_count,
    f.active_device_count,
    f.device_limit,
    f.storage_used_bytes,
    f.storage_limit_bytes,
    f.is_disabled,
    f.is_staff,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.admin_list_users(integer, integer, text, text) from public;
grant execute on function public.admin_list_users(integer, integer, text, text) to authenticated;

drop function if exists public.admin_get_client(uuid);

create or replace function public.admin_get_client(p_user_id uuid)
returns table (
  id uuid,
  email text,
  client_name text,
  created_at timestamptz,
  device_count bigint,
  online_device_count bigint,
  active_device_count bigint,
  device_limit integer,
  storage_used_bytes bigint,
  storage_limit_bytes bigint,
  is_disabled boolean,
  is_staff boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.client_name,
    p.created_at,
    count(d.id) as device_count,
    count(d.id) filter (where d.status = 'online') as online_device_count,
    count(d.id) filter (where not d.paused_by_quota and not d.playback_disabled) as active_device_count,
    p.device_limit,
    p.storage_used_bytes,
    p.storage_limit_bytes,
    p.is_disabled,
    exists (
      select 1
      from public.platform_staff s
      where s.user_id = p.id
        and s.is_active
    ) as is_staff
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  where p.id = p_user_id
    and u.is_anonymous = false
    and u.email is not null
  group by
    p.id,
    u.email,
    p.client_name,
    p.created_at,
    p.device_limit,
    p.storage_used_bytes,
    p.storage_limit_bytes,
    p.is_disabled;
end;
$$;

revoke all on function public.admin_get_client(uuid) from public;
grant execute on function public.admin_get_client(uuid) to authenticated;

-- Keep staff JWT in sync when operators are added/updated.
create or replace function public.admin_upsert_staff(
  p_email text,
  p_display_name text default null,
  p_role text default 'operator'
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_role text := coalesce(nullif(trim(p_role), ''), 'operator');
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role = 'owner'
  ) then
    raise exception 'Only platform owners can manage staff';
  end if;

  if v_role not in ('owner', 'operator', 'viewer') then
    raise exception 'Invalid role';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No account found for that email — ask them to sign up first';
  end if;

  insert into public.platform_staff (user_id, email, display_name, role, is_active)
  values (
    v_user_id,
    trim(p_email),
    nullif(trim(p_display_name), ''),
    v_role,
    true
  )
  on conflict (user_id) do update
    set
      email = excluded.email,
      display_name = coalesce(excluded.display_name, platform_staff.display_name),
      role = excluded.role,
      is_active = true;

  perform public.sync_user_app_metadata(v_user_id);
end;
$$;

revoke all on function public.admin_upsert_staff(text, text, text) from public;
grant execute on function public.admin_upsert_staff(text, text, text) to authenticated;

-- New signups: seed JWT flags on first profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, client_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;

  perform public.sync_user_app_metadata(new.id);
  return new;
end;
$$;
