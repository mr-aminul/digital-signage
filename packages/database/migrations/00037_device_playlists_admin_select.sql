-- Fix admin TV playlist assignment: admins could INSERT via device_playlists_insert_admin
-- but could not SELECT rows (upsert return + deactivate other assignments failed).

drop policy if exists device_playlists_select on public.device_playlists;
drop policy if exists "device_playlists: select by owner or tv" on public.device_playlists;

create policy device_playlists_select on public.device_playlists
  for select using (
    exists (
      select 1
      from public.devices d
      where d.id = device_id
        and (d.owner_id = auth.uid() or d.registered_session_id = auth.uid())
    )
    or public.is_platform_admin()
  );

-- 00033 used policy names that did not match production (colon-style names remained).
drop policy if exists device_playlists_insert_owner on public.device_playlists;
drop policy if exists "device_playlists: insert by owner" on public.device_playlists;
drop policy if exists device_playlists_update_owner on public.device_playlists;
drop policy if exists "device_playlists: update by owner" on public.device_playlists;
drop policy if exists device_playlists_delete_owner on public.device_playlists;
drop policy if exists "device_playlists: delete by owner" on public.device_playlists;

-- Clients must not assign playlists on TVs; only platform admins may write.
drop policy if exists device_playlists_insert_admin on public.device_playlists;
create policy device_playlists_insert_admin on public.device_playlists
  for insert with check (public.is_platform_admin());

drop policy if exists device_playlists_update_admin on public.device_playlists;
create policy device_playlists_update_admin on public.device_playlists
  for update using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists device_playlists_delete_admin on public.device_playlists;
create policy device_playlists_delete_admin on public.device_playlists
  for delete using (public.is_platform_admin());
