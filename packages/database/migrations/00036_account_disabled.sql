-- Disable client accounts: pauses all owned screens and blocks dashboard access.

alter table public.profiles
  add column if not exists is_disabled boolean not null default false;

comment on column public.profiles.is_disabled is
  'When true, the client cannot use the dashboard and all owned TVs show standby playback.';

create or replace function public.enforce_profile_disabled_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_disabled is distinct from old.is_disabled
     and not public.is_platform_admin() then
    raise exception 'Only platform admins can disable or enable client accounts'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_disabled_admin_only on public.profiles;
create trigger profiles_disabled_admin_only
  before update of is_disabled on public.profiles
  for each row
  execute function public.enforce_profile_disabled_admin_only();

create or replace function public.admin_set_account_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_admin
  ) then
    raise exception 'Cannot disable platform admin accounts';
  end if;

  update public.profiles
  set is_disabled = p_disabled
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;

  update public.devices
  set playback_disabled = p_disabled
  where owner_id = p_user_id;
end;
$$;

revoke all on function public.admin_set_account_disabled(uuid, boolean) from public;
grant execute on function public.admin_set_account_disabled(uuid, boolean) to authenticated;

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  device_count bigint,
  online_device_count bigint,
  is_disabled boolean,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.full_name,
    p.created_at,
    count(d.id) as device_count,
    count(d.id) filter (where d.status = 'online') as online_device_count,
    p.is_disabled,
    p.is_admin
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  where u.is_anonymous = false
    and u.email is not null
  group by p.id, u.email, p.full_name, p.created_at, p.is_disabled, p.is_admin
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- TVs treat a disabled owner account like playback_disabled on the device.
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

  select
    d.registered_session_id,
    d.owner_id,
    d.name,
    (d.playback_disabled or coalesce(p.is_disabled, false)),
    d.screen_orientation
  into v_reg, v_owner, v_device_name, v_playback_disabled, v_screen_orientation
  from public.devices d
  left join public.profiles p on p.id = d.owner_id
  where d.id = p_device_id;

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

  select
    d.registered_session_id,
    d.owner_id,
    d.name,
    (d.playback_disabled or coalesce(p.is_disabled, false))
  into v_reg, v_owner, v_device_name, v_playback_disabled
  from public.devices d
  left join public.profiles p on p.id = d.owner_id
  where d.id = p_device_id;

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

  select
      coalesce(
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
