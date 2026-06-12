-- Suspended clients may read their own profile (for status) but not tenant data.

drop policy if exists devices_select_access on public.devices;
create policy devices_select_access on public.devices
  for select using (
    (auth.uid() = owner_id and public.is_account_active())
    or auth.uid() = registered_session_id
    or public.is_platform_staff()
  );

drop policy if exists media_select_own on public.media;
create policy media_select_own on public.media
  for select using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff()
  );

drop policy if exists playlists_select_own on public.playlists;
create policy playlists_select_own on public.playlists
  for select using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff()
  );

drop policy if exists playlist_items_select_own on public.playlist_items;
create policy playlist_items_select_own on public.playlist_items
  for select using (
    (
      exists (
        select 1 from public.playlists p
        where p.id = playlist_id and p.owner_id = auth.uid()
      )
      and public.is_account_active()
    )
    or exists (
      select 1
      from public.device_playlists dp
      join public.devices d on d.id = dp.device_id
      where dp.playlist_id = playlist_items.playlist_id
        and d.registered_session_id = auth.uid()
    )
    or public.is_platform_staff()
  );

drop policy if exists device_playlists_select on public.device_playlists;
create policy device_playlists_select on public.device_playlists
  for select using (
    (
      public.is_account_active()
      and exists (
        select 1
        from public.devices d
        where d.id = device_id
          and d.owner_id = auth.uid()
      )
    )
    or exists (
      select 1
      from public.devices d
      where d.id = device_id
        and d.registered_session_id = auth.uid()
    )
    or public.is_platform_staff()
  );

drop policy if exists media_objects_select on storage.objects;
create policy media_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_account_active())
      or public.is_platform_staff()
    )
  );
