-- Clients manage playlist assignment on their own devices; admins retain cross-tenant access.
-- 00037 removed owner write policies — restore them alongside admin policies.

drop policy if exists device_playlists_insert_owner on public.device_playlists;
create policy device_playlists_insert_owner on public.device_playlists
  for insert with check (
    exists (
      select 1
      from public.devices d
      join public.playlists p on p.id = playlist_id
      where d.id = device_id
        and d.owner_id = auth.uid()
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists device_playlists_update_owner on public.device_playlists;
create policy device_playlists_update_owner on public.device_playlists
  for update using (
    exists (
      select 1
      from public.devices d
      where d.id = device_id
        and d.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.devices d
      where d.id = device_id
        and d.owner_id = auth.uid()
    )
  );

drop policy if exists device_playlists_delete_owner on public.device_playlists;
create policy device_playlists_delete_owner on public.device_playlists
  for delete using (
    exists (
      select 1
      from public.devices d
      where d.id = device_id
        and d.owner_id = auth.uid()
    )
  );

-- Admin write policies from 00037 remain (is_platform_admin).
