-- Adds contentRevision (stable hash) and playlistId to tv_get_playback_slides for client-side cache invalidation.
create or replace function public.tv_get_playback_slides(p_device_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg uuid;
  v_playlist_id uuid;
  v_dp_updated timestamptz;
  v_name text;
  v_slides jsonb;
  v_content_hash text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', to_jsonb(false));
  end if;

  select d.registered_session_id
  into v_reg
  from public.devices d
  where d.id = p_device_id;

  if v_reg is null or v_reg is distinct from auth.uid() then
    return jsonb_build_object('ok', to_jsonb(false));
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
      'playlistName', to_jsonb(null::text),
      'slides', '[]'::jsonb,
      'contentRevision', to_jsonb(null::text),
      'playlistId', to_jsonb(null::uuid)
    );
  end if;

  select p.name into v_name
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
    'playlistName', to_jsonb(v_name),
    'contentRevision', to_jsonb(v_content_hash),
    'playlistId', to_jsonb(v_playlist_id),
    'slides', v_slides
  );
end;
$$;

revoke all on function public.tv_get_playback_slides(uuid) from public;
grant execute on function public.tv_get_playback_slides(uuid) to anon, authenticated;
