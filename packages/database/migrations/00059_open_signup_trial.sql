-- Open self-serve signup with 7-day trial (1 screen default). Admin invites skip trial.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists trial_ends_at timestamptz;

alter table public.profiles
  add column if not exists plan_kind text not null default 'standard';

alter table public.profiles
  drop constraint if exists profiles_plan_kind_check;

alter table public.profiles
  add constraint profiles_plan_kind_check check (plan_kind in ('trial', 'standard', 'custom'));

comment on column public.profiles.trial_ends_at is
  'When set and in the past, account is trial-expired. Null = no trial clock (legacy, paid, admin-invited).';

comment on column public.profiles.plan_kind is
  'trial = self-serve signup; standard = grandfathered or converted; custom = staff-assigned plan.';

-- Existing clients: no trial enforcement.
update public.profiles
set
  trial_ends_at = null,
  plan_kind = 'standard';

-- ---------------------------------------------------------------------------
-- Trial helpers
-- ---------------------------------------------------------------------------

create or replace function public.profile_is_trial_expired(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.trial_ends_at is not null and now() > p.trial_ends_at
      from public.profiles p
      where p.id = p_user_id
    ),
    false
  );
$$;

revoke all on function public.profile_is_trial_expired(uuid) from public;
grant execute on function public.profile_is_trial_expired(uuid) to authenticated;

create or replace function public.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select not p.is_disabled
        and (p.trial_ends_at is null or now() <= p.trial_ends_at)
      from public.profiles p
      where p.id = auth.uid()
    ),
    true
  );
$$;

comment on function public.is_account_active() is
  'False when the signed-in user is suspended or their trial has expired.';

-- ---------------------------------------------------------------------------
-- New signups: seed trial for self-serve; admin invites pass skip_trial in metadata.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_skip_trial boolean;
begin
  v_client_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );

  v_skip_trial := coalesce(new.raw_user_meta_data->>'skip_trial', '') = 'true';

  insert into public.profiles (id, client_name, device_limit, storage_limit_bytes, trial_ends_at, plan_kind)
  values (
    new.id,
    v_client_name,
    1,
    2147483648,
    case when v_skip_trial then null else now() + interval '7 days' end,
    case when v_skip_trial then 'standard' else 'trial' end
  )
  on conflict (id) do nothing;

  perform public.sync_user_app_metadata(new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- JWT sync: expose trial_expired for middleware
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
  v_trial_expired boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  select
    coalesce(p.is_disabled, false),
    public.profile_is_trial_expired(p.id)
  into v_disabled, v_trial_expired
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
      'is_platform_staff', v_staff,
      'trial_expired', v_trial_expired
    )
  where u.id = p_user_id;
end;
$$;

-- Backfill JWT trial flags.
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
-- TV playback: pause when trial expired
-- ---------------------------------------------------------------------------

create or replace function public.device_effective_playback_disabled(p_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (
        d.playback_disabled
        or d.paused_by_quota
        or coalesce(p.is_disabled, false)
        or public.profile_is_trial_expired(p.id)
      )
      from public.devices d
      left join public.profiles p on p.id = d.owner_id
      where d.id = p_device_id
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Quota RPCs: block writes when trial expired
-- ---------------------------------------------------------------------------

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

  if public.profile_is_trial_expired(p_owner_id) then
    raise exception 'trial_expired';
  end if;

  if p_add_bytes is null or p_add_bytes < 0 then
    raise exception 'invalid_file_size';
  end if;

  select p.storage_limit_bytes
  into v_limit
  from public.profiles p
  where p.id = p_owner_id;

  if v_limit is null then
    raise exception 'owner_not_found';
  end if;

  v_used := public.get_owner_storage_used(p_owner_id);

  if v_used + p_add_bytes > v_limit then
    raise exception 'storage_limit_reached';
  end if;
end;
$$;

create or replace function public.link_device_by_pairing_code(
  p_code text,
  p_name text default null,
  p_owner_id uuid default null
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.devices;
  v_owner_id uuid;
  v_device_count bigint;
  v_limit integer;
begin
  if p_code !~ '^[0-9]{6}$' then
    raise exception 'invalid_pairing_code';
  end if;

  v_owner_id := coalesce(p_owner_id, auth.uid());
  if v_owner_id is null then
    raise exception 'not_authenticated';
  end if;

  if public.profile_is_trial_expired(v_owner_id) then
    raise exception 'trial_expired';
  end if;

  if p_owner_id is not null and p_owner_id is distinct from auth.uid() then
    if not public.is_platform_staff_writer() then
      raise exception 'Forbidden';
    end if;
  end if;

  select p.device_limit
  into v_limit
  from public.profiles p
  where p.id = v_owner_id;

  if v_limit is null then
    raise exception 'owner_not_found';
  end if;

  select count(*)
  into v_device_count
  from public.devices d
  where d.owner_id = v_owner_id;

  if v_device_count >= v_limit then
    raise exception 'device_limit_reached';
  end if;

  update public.devices d
  set
    owner_id = v_owner_id,
    name = coalesce(nullif(trim(p_name), ''), d.name),
    status = 'offline'
  where d.pairing_code = p_code
    and d.owner_id is null
  returning * into strict result;

  insert into public.device_playback_credentials (device_id, secret)
  values (result.id, lower(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
  on conflict (device_id) do update set secret = excluded.secret;

  return result;
exception
  when no_data_found then
    raise exception 'device_not_found_or_already_linked';
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: trial management
-- ---------------------------------------------------------------------------

create or replace function public.admin_extend_trial(p_user_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old timestamptz;
  v_new timestamptz;
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid_trial_days';
  end if;

  select p.trial_ends_at into v_old
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'User not found';
  end if;

  v_new := greatest(coalesce(v_old, now()), now()) + make_interval(days => p_days);

  update public.profiles
  set
    trial_ends_at = v_new,
    plan_kind = case when plan_kind = 'standard' then 'trial' else plan_kind end
  where id = p_user_id;

  perform public.sync_user_app_metadata(p_user_id);

  perform public.log_admin_action(
    'trial_extend',
    p_user_id,
    jsonb_build_object(
      'trial_ends_at_before', v_old,
      'trial_ends_at_after', v_new,
      'days_added', p_days
    )
  );
end;
$$;

revoke all on function public.admin_extend_trial(uuid, integer) from public;
grant execute on function public.admin_extend_trial(uuid, integer) to authenticated;

create or replace function public.admin_convert_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old timestamptz;
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  select p.trial_ends_at into v_old
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'User not found';
  end if;

  update public.profiles
  set
    trial_ends_at = null,
    plan_kind = 'custom'
  where id = p_user_id;

  perform public.sync_user_app_metadata(p_user_id);

  perform public.log_admin_action(
    'trial_convert',
    p_user_id,
    jsonb_build_object('trial_ends_at_before', v_old)
  );
end;
$$;

revoke all on function public.admin_convert_account(uuid) from public;
grant execute on function public.admin_convert_account(uuid) to authenticated;

-- Plan updates from staff also clear trial (upgrade path).
create or replace function public.admin_update_plan(
  p_user_id uuid,
  p_device_limit integer,
  p_storage_limit_bytes bigint,
  p_active_device_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
begin
  if not public.is_platform_staff_writer() then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if p_device_limit is null or p_device_limit < 1 then
    raise exception 'invalid_device_limit';
  end if;

  if p_storage_limit_bytes is null or p_storage_limit_bytes < 1048576 then
    raise exception 'invalid_storage_limit';
  end if;

  select p.device_limit, p.storage_limit_bytes, p.trial_ends_at
  into v_old
  from public.profiles p
  where p.id = p_user_id
  for update;

  if v_old is null then
    raise exception 'User not found';
  end if;

  update public.profiles
  set
    device_limit = p_device_limit,
    storage_limit_bytes = p_storage_limit_bytes,
    trial_ends_at = null,
    plan_kind = 'custom'
  where id = p_user_id;

  perform public.apply_device_quota(p_user_id, p_device_limit, p_active_device_ids, false);
  perform public.sync_user_app_metadata(p_user_id);

  perform public.log_admin_action(
    'plan_update',
    p_user_id,
    jsonb_build_object(
      'device_limit_before', v_old.device_limit,
      'device_limit_after', p_device_limit,
      'storage_limit_bytes_before', v_old.storage_limit_bytes,
      'storage_limit_bytes_after', p_storage_limit_bytes,
      'trial_ends_at_before', v_old.trial_ends_at,
      'active_device_ids', coalesce(to_jsonb(p_active_device_ids), 'null'::jsonb)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin directory: trial fields, replace waitlist stats
-- ---------------------------------------------------------------------------

drop function if exists public.admin_list_users(integer, integer, text, text);

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
  invitation_pending boolean,
  trial_ends_at timestamptz,
  plan_kind text,
  trial_expired boolean,
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
      ) as is_staff,
      (
        u.last_sign_in_at is null
        and exists (
          select 1
          from public.client_invitations ci
          where ci.user_id = p.id
            and ci.status = 'pending'
        )
      ) as invitation_pending,
      p.trial_ends_at,
      p.plan_kind,
      public.profile_is_trial_expired(p.id) as trial_expired
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
      p.is_disabled,
      p.trial_ends_at,
      p.plan_kind,
      u.last_sign_in_at
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
    f.invitation_pending,
    f.trial_ends_at,
    f.plan_kind,
    f.trial_expired,
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
  is_staff boolean,
  trial_ends_at timestamptz,
  plan_kind text,
  trial_expired boolean
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
    ) as is_staff,
    p.trial_ends_at,
    p.plan_kind,
    public.profile_is_trial_expired(p.id) as trial_expired
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
    p.is_disabled,
    p.trial_ends_at,
    p.plan_kind;
end;
$$;

revoke all on function public.admin_get_client(uuid) from public;
grant execute on function public.admin_get_client(uuid) to authenticated;

drop function if exists public.admin_directory_stats();

create or replace function public.admin_directory_stats()
returns table (
  client_count bigint,
  device_count bigint,
  online_device_count bigint,
  disabled_count bigint,
  active_trial_count bigint,
  expired_trial_count bigint
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
    count(distinct p.id) filter (where p.is_disabled) as disabled_count,
    count(distinct p.id) filter (
      where p.trial_ends_at is not null
        and now() <= p.trial_ends_at
        and not p.is_disabled
    ) as active_trial_count,
    count(distinct p.id) filter (
      where public.profile_is_trial_expired(p.id)
        and not p.is_disabled
    ) as expired_trial_count
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  where u.is_anonymous = false
    and u.email is not null;
end;
$$;

revoke all on function public.admin_directory_stats() from public;
grant execute on function public.admin_directory_stats() to authenticated;
