-- Audit log, atomic plan updates, device link locking, TV quota pause helper.

-- ---------------------------------------------------------------------------
-- Admin audit log
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_target_user_id_idx
  on public.admin_audit_log (target_user_id, created_at desc);

comment on table public.admin_audit_log is
  'Platform staff actions on client accounts (suspend, plan changes, etc.).';

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_select_staff on public.admin_audit_log;
create policy admin_audit_log_select_staff on public.admin_audit_log
  for select using (public.is_platform_staff());

create or replace function public.log_admin_action(
  p_action text,
  p_target_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_user_id, metadata)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_action), ''), 'unknown'),
    p_target_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_admin_action(text, uuid, jsonb) from public;
grant execute on function public.log_admin_action(text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- TV: unified playback pause check
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
      select (d.playback_disabled or d.paused_by_quota or coalesce(p.is_disabled, false))
      from public.devices d
      left join public.profiles p on p.id = d.owner_id
      where d.id = p_device_id
    ),
    false
  );
$$;

revoke all on function public.device_effective_playback_disabled(uuid) from public;
grant execute on function public.device_effective_playback_disabled(uuid) to authenticated;

-- Patch TV RPCs to honour paused_by_quota (00036 only checked playback_disabled + is_disabled).
create or replace function public.tv_get_playback_revision(p_device_id uuid, p_playback_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg uuid;
  v_owner uuid;
  v_device_name text;
  v_playback_disabled boolean := false;
  v_screen_orientation text := 'landscape';
  v_secret text;
  v_ok_secret boolean := false;
  v_ok_jwt boolean := false;
  v_playlist_id uuid;
  v_dp_updated timestamptz;
  v_playlist_name text;
  v_content_hash text;
begin
  if not exists (select 1 from public.devices d where d.id = p_device_id) then
    return jsonb_build_object('ok', to_jsonb(false));
  end if;

  select d.registered_session_id, d.owner_id, d.name, d.screen_orientation
  into v_reg, v_owner, v_device_name, v_screen_orientation
  from public.devices d
  where d.id = p_device_id;

  v_playback_disabled := public.device_effective_playback_disabled(p_device_id);

  select c.secret
  into v_secret
  from public.device_playback_credentials c
  where c.device_id = p_device_id;

  if v_owner is not null
     and v_secret is null
     and auth.uid() is not null
     and v_reg is not distinct from auth.uid() then
    v_secret := lower(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
    insert into public.device_playback_credentials (device_id, secret)
    values (p_device_id, v_secret);
  end if;

  if p_playback_secret is not null
     and trim(p_playback_secret) <> ''
     and v_secret is not null
     and trim(v_secret) <> ''
     and v_secret = p_playback_secret then
    v_ok_secret := true;
  end if;

  if not v_ok_secret then
    if auth.uid() is null then
      return jsonb_build_object('ok', to_jsonb(false));
    end if;
    if v_reg is null or v_reg is distinct from auth.uid() then
      return jsonb_build_object('ok', to_jsonb(false));
    end if;
    v_ok_jwt := true;
  end if;

  if v_playback_disabled then
    v_content_hash := md5('playback_disabled|' || p_device_id::text);
    return jsonb_build_object(
      'ok', to_jsonb(true),
      'deviceName', to_jsonb(v_device_name),
      'playbackDisabled', to_jsonb(true),
      'playbackSecret', case
        when v_ok_jwt and v_secret is not null then to_jsonb(v_secret)
        else 'null'::jsonb
      end,
      'contentRevision', to_jsonb(v_content_hash),
      'playlistId', to_jsonb(null::uuid),
      'playlistName', to_jsonb(null::text),
      'screenOrientation', to_jsonb(v_screen_orientation)
    );
  end if;

  select dp.playlist_id, dp.updated_at
  into v_playlist_id, v_dp_updated
  from public.device_playlists dp
  where dp.device_id = p_device_id
    and dp.is_active = true
  order by dp.updated_at desc nulls last
  limit 1;

  if v_playlist_id is null then
    return jsonb_build_object(
      'ok', to_jsonb(true),
      'deviceName', to_jsonb(v_device_name),
      'playbackDisabled', to_jsonb(false),
      'playbackSecret', case
        when v_ok_jwt and v_secret is not null then to_jsonb(v_secret)
        else 'null'::jsonb
      end,
      'contentRevision', to_jsonb(null::text),
      'playlistId', to_jsonb(null::uuid),
      'playlistName', to_jsonb(null::text),
      'screenOrientation', to_jsonb(v_screen_orientation)
    );
  end if;

  select p.name into v_playlist_name
  from public.playlists p
  where p.id = v_playlist_id;

  select
    coalesce(
      md5(
        v_playlist_id::text
        || '|'
        || coalesce(v_dp_updated::text, '')
        || '|'
        || coalesce((
            select string_agg(
              pi.id::text
              || ':' || pi.sort_order::text
              || ':' || public.playback_slide_duration_label(
                m.file_type, pi.duration_seconds, m.duration_seconds
              )
              || ':' || m.storage_path,
              '>' order by pi.sort_order asc, pi.created_at asc
            )
            from public.playlist_items pi
            join public.media m on m.id = pi.media_id
            where pi.playlist_id = v_playlist_id
              and m.storage_path is not null
              and length(trim(m.storage_path)) > 0
        ), '')
      ),
      ''
    )
  into v_content_hash;

  return jsonb_build_object(
    'ok', to_jsonb(true),
    'deviceName', to_jsonb(v_device_name),
    'playbackDisabled', to_jsonb(false),
    'playbackSecret', case
      when v_ok_jwt and v_secret is not null then to_jsonb(v_secret)
      else 'null'::jsonb
    end,
    'contentRevision', to_jsonb(v_content_hash),
    'playlistId', to_jsonb(v_playlist_id),
    'playlistName', to_jsonb(v_playlist_name),
    'screenOrientation', to_jsonb(v_screen_orientation)
  );
end;
$$;

create or replace function public.tv_get_playback_slides(p_device_id uuid, p_playback_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg uuid;
  v_owner uuid;
  v_device_name text;
  v_playback_disabled boolean := false;
  v_secret text;
  v_ok_secret boolean := false;
  v_ok_jwt boolean := false;
  v_playlist_id uuid;
  v_dp_updated timestamptz;
  v_playlist_name text;
  v_slides jsonb;
  v_content_hash text;
begin
  if not exists (select 1 from public.devices d where d.id = p_device_id) then
    return jsonb_build_object('ok', to_jsonb(false));
  end if;

  select d.registered_session_id, d.owner_id, d.name
  into v_reg, v_owner, v_device_name
  from public.devices d
  where d.id = p_device_id;

  v_playback_disabled := public.device_effective_playback_disabled(p_device_id);

  select c.secret
  into v_secret
  from public.device_playback_credentials c
  where c.device_id = p_device_id;

  if v_owner is not null
     and v_secret is null
     and auth.uid() is not null
     and v_reg is not distinct from auth.uid() then
    v_secret := lower(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
    insert into public.device_playback_credentials (device_id, secret)
    values (p_device_id, v_secret);
  end if;

  if p_playback_secret is not null
     and trim(p_playback_secret) <> ''
     and v_secret is not null
     and trim(v_secret) <> ''
     and v_secret = p_playback_secret then
    v_ok_secret := true;
  end if;

  if not v_ok_secret then
    if auth.uid() is null then
      return jsonb_build_object('ok', to_jsonb(false));
    end if;
    if v_reg is null or v_reg is distinct from auth.uid() then
      return jsonb_build_object('ok', to_jsonb(false));
    end if;
    v_ok_jwt := true;
  end if;

  if v_playback_disabled then
    v_content_hash := md5('playback_disabled|' || p_device_id::text);
    return jsonb_build_object(
      'ok', to_jsonb(true),
      'deviceName', to_jsonb(v_device_name),
      'playbackDisabled', to_jsonb(true),
      'playbackSecret', case
        when v_ok_jwt and v_secret is not null then to_jsonb(v_secret)
        else 'null'::jsonb
      end,
      'playlistName', to_jsonb(null::text),
      'slides', '[]'::jsonb,
      'contentRevision', to_jsonb(v_content_hash),
      'playlistId', to_jsonb(null::uuid)
    );
  end if;

  select dp.playlist_id, dp.updated_at
  into v_playlist_id, v_dp_updated
  from public.device_playlists dp
  where dp.device_id = p_device_id
    and dp.is_active = true
  order by dp.updated_at desc nulls last
  limit 1;

  if v_playlist_id is null then
    return jsonb_build_object(
      'ok', to_jsonb(true),
      'deviceName', to_jsonb(v_device_name),
      'playbackDisabled', to_jsonb(false),
      'playbackSecret', case
        when v_ok_jwt and v_secret is not null then to_jsonb(v_secret)
        else 'null'::jsonb
      end,
      'playlistName', to_jsonb(null::text),
      'slides', '[]'::jsonb,
      'contentRevision', to_jsonb(null::text),
      'playlistId', to_jsonb(null::uuid)
    );
  end if;

  select p.name into v_playlist_name
  from public.playlists p
  where p.id = v_playlist_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fileType', m.file_type,
        'durationSeconds', public.playback_slide_duration_seconds(
          m.file_type, pi.duration_seconds, m.duration_seconds
        ),
        'storagePath', m.storage_path
      )
      order by pi.sort_order asc, pi.created_at asc
    ),
    '[]'::jsonb
  )
  into v_slides
  from public.playlist_items pi
  join public.media m on m.id = pi.media_id
  where pi.playlist_id = v_playlist_id
    and m.storage_path is not null
    and length(trim(m.storage_path)) > 0;

  if v_slides is null then
    v_slides := '[]'::jsonb;
  end if;

  select
    coalesce(
      md5(
        v_playlist_id::text
        || '|'
        || coalesce(v_dp_updated::text, '')
        || '|'
        || coalesce((
            select string_agg(
              pi.id::text
              || ':' || pi.sort_order::text
              || ':' || public.playback_slide_duration_label(
                m.file_type, pi.duration_seconds, m.duration_seconds
              )
              || ':' || m.storage_path,
              '>' order by pi.sort_order asc, pi.created_at asc
            )
            from public.playlist_items pi
            join public.media m on m.id = pi.media_id
            where pi.playlist_id = v_playlist_id
              and m.storage_path is not null
              and length(trim(m.storage_path)) > 0
        ), '')
      ),
      ''
    )
  into v_content_hash;

  return jsonb_build_object(
    'ok', to_jsonb(true),
    'deviceName', to_jsonb(v_device_name),
    'playbackDisabled', to_jsonb(false),
    'playbackSecret', case
      when v_ok_jwt and v_secret is not null then to_jsonb(v_secret)
      else 'null'::jsonb
    end,
    'playlistName', to_jsonb(v_playlist_name),
    'contentRevision', to_jsonb(v_content_hash),
    'playlistId', to_jsonb(v_playlist_id),
    'slides', v_slides
  );
end;
$$;

revoke all on function public.tv_get_playback_revision(uuid, text) from public;
grant execute on function public.tv_get_playback_revision(uuid, text) to anon, authenticated;
revoke all on function public.tv_get_playback_slides(uuid, text) from public;
grant execute on function public.tv_get_playback_slides(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Device link: row lock prevents concurrent over-link
-- ---------------------------------------------------------------------------

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

  if p_owner_id is not null and p_owner_id is distinct from auth.uid() then
    if not public.is_platform_staff_writer() then
      raise exception 'Forbidden';
    end if;
  end if;

  select p.device_limit
  into v_limit
  from public.profiles p
  where p.id = v_owner_id
  for update;

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
-- Atomic plan update + audit
-- ---------------------------------------------------------------------------

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

  select p.device_limit, p.storage_limit_bytes
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
    storage_limit_bytes = p_storage_limit_bytes
  where id = p_user_id;

  perform public.apply_device_quota(p_user_id, p_device_limit, p_active_device_ids);

  perform public.log_admin_action(
    'plan_update',
    p_user_id,
    jsonb_build_object(
      'device_limit_before', v_old.device_limit,
      'device_limit_after', p_device_limit,
      'storage_limit_bytes_before', v_old.storage_limit_bytes,
      'storage_limit_bytes_after', p_storage_limit_bytes,
      'active_device_ids', coalesce(to_jsonb(p_active_device_ids), 'null'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_update_plan(uuid, integer, bigint, uuid[]) from public;
grant execute on function public.admin_update_plan(uuid, integer, bigint, uuid[]) to authenticated;

-- Audit on account suspend / enable (00049 body + logging).
create or replace function public.admin_set_account_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_was_disabled boolean;
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

  select p.is_disabled
  into v_was_disabled
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;

  update public.profiles
  set is_disabled = p_disabled
  where id = p_user_id;

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

  if v_was_disabled is distinct from p_disabled then
    perform public.log_admin_action(
      case when p_disabled then 'account_disable' else 'account_enable' end,
      p_user_id,
      jsonb_build_object('was_disabled', v_was_disabled, 'is_disabled', p_disabled)
    );
  end if;
end;
$$;
