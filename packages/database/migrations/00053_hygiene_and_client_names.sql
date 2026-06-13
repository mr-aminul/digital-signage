-- Purge abandoned pairing screens, backfill client names, harden auth_google_identities RLS.

-- ---------------------------------------------------------------------------
-- Display name helper (email local-part fallback)
-- ---------------------------------------------------------------------------

create or replace function public.profile_display_name(p_client_name text, p_email text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(p_client_name), ''), nullif(split_part(coalesce(p_email, ''), '@', 1), ''));
$$;

-- ---------------------------------------------------------------------------
-- Purge stale unclaimed devices (owner_id is null, no recent heartbeat)
-- ---------------------------------------------------------------------------

create or replace function public.purge_stale_unclaimed_devices(p_stale_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_stale_days, 7), 1));
  v_session_ids uuid[];
  n integer;
begin
  select coalesce(array_agg(d.registered_session_id) filter (where d.registered_session_id is not null), '{}')
  into v_session_ids
  from public.devices d
  where d.owner_id is null
    and (d.last_seen is null or d.last_seen < v_cutoff);

  delete from public.devices d
  where d.owner_id is null
    and (d.last_seen is null or d.last_seen < v_cutoff);

  get diagnostics n = row_count;

  if coalesce(array_length(v_session_ids, 1), 0) > 0 then
    delete from auth.users u
    where u.id = any(v_session_ids)
      and u.is_anonymous = true;
  end if;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.purge_stale_unclaimed_devices(integer) from public;
grant execute on function public.purge_stale_unclaimed_devices(integer) to service_role;

select public.purge_stale_unclaimed_devices(7);

-- ---------------------------------------------------------------------------
-- Backfill empty client_name from signup email
-- ---------------------------------------------------------------------------

update public.profiles p
set client_name = split_part(u.email, '@', 1)
from auth.users u
where u.id = p.id
  and u.email is not null
  and (p.client_name is null or trim(p.client_name) = '');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
begin
  v_client_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );

  insert into public.profiles (id, client_name)
  values (new.id, v_client_name)
  on conflict (id) do nothing;

  perform public.sync_user_app_metadata(new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs: return display-friendly client names
-- ---------------------------------------------------------------------------

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
set search_path = public, auth, extensions
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
      public.profile_display_name(p.client_name, u.email::text) as client_name,
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
        or lower(public.profile_display_name(p.client_name, u.email::text)) like '%' || lower(v_search) || '%'
        or similarity(lower(public.profile_display_name(p.client_name, u.email::text)), lower(v_search)) > 0.25
        or similarity(lower(u.email::text), lower(v_search)) > 0.25
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
    public.profile_display_name(p.client_name, u.email::text) as client_name,
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

-- ---------------------------------------------------------------------------
-- auth_google_identities: explicit deny for API roles (service role only)
-- ---------------------------------------------------------------------------

drop policy if exists auth_google_identities_deny_api on public.auth_google_identities;
create policy auth_google_identities_deny_api on public.auth_google_identities
  for all
  to authenticated, anon
  using (false)
  with check (false);

-- Audit log: display-friendly target client names
create or replace function public.admin_list_audit_log(
  p_limit integer default 50,
  p_offset integer default 0,
  p_target_user_id uuid default null,
  p_action text default null
)
returns table (
  id uuid,
  action text,
  actor_id uuid,
  actor_email text,
  actor_display_name text,
  target_user_id uuid,
  target_email text,
  target_client_name text,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_action text := nullif(trim(coalesce(p_action, '')), '');
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  if v_limit > 200 then
    v_limit := 200;
  end if;

  return query
  with filtered as (
    select
      l.id,
      l.action,
      l.actor_id,
      actor_u.email::text as actor_email,
      actor_staff.display_name as actor_display_name,
      l.target_user_id,
      target_u.email::text as target_email,
      public.profile_display_name(target_p.client_name, target_u.email::text) as target_client_name,
      l.metadata,
      l.created_at
    from public.admin_audit_log l
    join auth.users actor_u on actor_u.id = l.actor_id
    left join public.platform_staff actor_staff
      on actor_staff.user_id = l.actor_id
      and actor_staff.is_active
    left join auth.users target_u on target_u.id = l.target_user_id
    left join public.profiles target_p on target_p.id = l.target_user_id
    where (p_target_user_id is null or l.target_user_id = p_target_user_id)
      and (v_action is null or l.action = v_action)
  )
  select
    f.id,
    f.action,
    f.actor_id,
    f.actor_email,
    f.actor_display_name,
    f.target_user_id,
    f.target_email,
    f.target_client_name,
    f.metadata,
    f.created_at,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;
