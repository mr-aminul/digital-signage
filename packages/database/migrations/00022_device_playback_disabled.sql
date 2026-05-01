-- Admin can pause playback on a linked TV without unassigning the playlist.
-- Also introduces device_playback_credentials (secret not exposed via dashboard devices select *).

create table if not exists public.device_playback_credentials (
  device_id uuid primary key references public.devices (id) on delete cascade,
  secret text not null
);

comment on table public.device_playback_credentials is
  'TV manifest auth secret; readable only inside security definer RPCs.';

alter table public.device_playback_credentials enable row level security;

revoke all on table public.device_playback_credentials from public;
revoke all on table public.device_playback_credentials from anon, authenticated;
grant all on table public.device_playback_credentials to service_role;
grant all on table public.device_playback_credentials to postgres;

insert into public.device_playback_credentials (device_id, secret)
select d.id, lower(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
from public.devices d
where d.owner_id is not null
on conflict (device_id) do nothing;

create or replace function public.link_device_by_pairing_code(p_code text, p_name text default null)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.devices;
begin
  if p_code !~ '^[0-9]{6}$' then
    raise exception 'invalid_pairing_code';
  end if;

  update public.devices d
  set
    owner_id = auth.uid(),
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

grant execute on function public.link_device_by_pairing_code(text, text) to authenticated;

alter table public.devices
  add column if not exists playback_disabled boolean not null default false;

comment on column public.devices.playback_disabled is
  'When true, tv_get_playback_slides returns empty slides and playbackDisabled; TV shows standby branding.';

drop function if exists public.tv_get_playback_slides(uuid);

create or replace function public.tv_get_playback_slides(p_device_id uuid, p_playback_secret text default null)
returns jsonb
language plpgsql
volatile
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

  select d.registered_session_id, d.owner_id, d.name, d.playback_disabled
  into v_reg, v_owner, v_device_name, v_playback_disabled
  from public.devices d
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

  update public.devices d
  set
    last_seen = now(),
    status = 'online'
  where d.id = p_device_id
    and (
      v_ok_secret
      or (
        auth.uid() is not null
        and d.registered_session_id is not distinct from auth.uid()
      )
    );

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
              || ':' || coalesce(pi.duration_seconds::text, 'n')
              || ':' || m.storage_path,
              '>' order by pi.sort_order asc, pi.id asc
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
          'durationSeconds', pi.duration_seconds,
          'storagePath', m.storage_path
        )
        order by pi.sort_order asc, pi.id asc
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

revoke all on function public.tv_get_playback_slides(uuid, text) from public;
grant execute on function public.tv_get_playback_slides(uuid, text) to anon, authenticated;
