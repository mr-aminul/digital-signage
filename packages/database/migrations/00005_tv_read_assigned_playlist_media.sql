-- TV (anonymous session on device) must read playlist + media metadata for active assignments.

drop policy if exists playlists_select_tv_assigned on public.playlists;
create policy playlists_select_tv_assigned on public.playlists
  for select using (
    exists (
      select 1
      from public.device_playlists dp
      join public.devices d on d.id = dp.device_id
      where dp.playlist_id = playlists.id
        and d.registered_session_id = auth.uid()
        and dp.is_active = true
    )
  );

drop policy if exists media_select_tv_assigned on public.media;
create policy media_select_tv_assigned on public.media
  for select using (
    exists (
      select 1
      from public.playlist_items pi
      join public.device_playlists dp on dp.playlist_id = pi.playlist_id
      join public.devices d on d.id = dp.device_id
      where pi.media_id = media.id
        and d.registered_session_id = auth.uid()
        and dp.is_active = true
    )
  );
