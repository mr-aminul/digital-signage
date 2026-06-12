-- Platform admin role: cross-tenant management + TV playlist assignment restricted to admins.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Seed first platform admin (no-op if account does not exist yet).
update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('aminulislamborhan@gmail.com');

-- ---------------------------------------------------------------------------
-- Profiles: admin can list all users
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Devices: admin full access (except TV insert/claim flows unchanged)
-- ---------------------------------------------------------------------------
drop policy if exists devices_select_access on public.devices;
create policy devices_select_access on public.devices
  for select using (
    auth.uid() = owner_id
    or auth.uid() = registered_session_id
    or public.is_platform_admin()
  );

drop policy if exists devices_update_owner on public.devices;
create policy devices_update_owner on public.devices
  for update using (auth.uid() = owner_id or public.is_platform_admin());

drop policy if exists devices_delete_owner on public.devices;
create policy devices_delete_owner on public.devices
  for delete using (auth.uid() = owner_id or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------
drop policy if exists media_select_own on public.media;
create policy media_select_own on public.media
  for select using (auth.uid() = owner_id or public.is_platform_admin());

drop policy if exists media_insert_own on public.media;
create policy media_insert_own on public.media
  for insert with check (auth.uid() = owner_id or public.is_platform_admin());

drop policy if exists media_update_own on public.media;
create policy media_update_own on public.media
  for update using (auth.uid() = owner_id or public.is_platform_admin());

drop policy if exists media_delete_own on public.media;
create policy media_delete_own on public.media
  for delete using (auth.uid() = owner_id or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Playlists
-- ---------------------------------------------------------------------------
drop policy if exists playlists_select_own on public.playlists;
create policy playlists_select_own on public.playlists
  for select using (auth.uid() = owner_id or public.is_platform_admin());

drop policy if exists playlists_insert_own on public.playlists;
create policy playlists_insert_own on public.playlists
  for insert with check (auth.uid() = owner_id or public.is_platform_admin());

drop policy if exists playlists_update_own on public.playlists;
create policy playlists_update_own on public.playlists
  for update using (auth.uid() = owner_id or public.is_platform_admin());

drop policy if exists playlists_delete_own on public.playlists;
create policy playlists_delete_own on public.playlists
  for delete using (auth.uid() = owner_id or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Playlist items
-- ---------------------------------------------------------------------------
drop policy if exists playlist_items_select_own on public.playlist_items;
create policy playlist_items_select_own on public.playlist_items
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.device_playlists dp
      join public.devices d on d.id = dp.device_id
      where dp.playlist_id = playlist_items.playlist_id
        and d.registered_session_id = auth.uid()
    )
    or public.is_platform_admin()
  );

drop policy if exists playlist_items_insert_own on public.playlist_items;
create policy playlist_items_insert_own on public.playlist_items
  for insert with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
    or public.is_platform_admin()
  );

drop policy if exists playlist_items_update_own on public.playlist_items;
create policy playlist_items_update_own on public.playlist_items
  for update using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
    or public.is_platform_admin()
  );

drop policy if exists playlist_items_delete_own on public.playlist_items;
create policy playlist_items_delete_own on public.playlist_items
  for delete using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Device playlists: only platform admin may assign/unassign playlists on TVs
-- ---------------------------------------------------------------------------
drop policy if exists device_playlists_insert_owner on public.device_playlists;
create policy device_playlists_insert_admin on public.device_playlists
  for insert with check (public.is_platform_admin());

drop policy if exists device_playlists_update_owner on public.device_playlists;
create policy device_playlists_update_admin on public.device_playlists
  for update using (public.is_platform_admin());

drop policy if exists device_playlists_delete_owner on public.device_playlists;
create policy device_playlists_delete_admin on public.device_playlists
  for delete using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- mark_stale_devices_offline: optional owner scope for admin impersonation
-- ---------------------------------------------------------------------------
drop function if exists public.mark_stale_devices_offline();

create or replace function public.mark_stale_devices_offline(p_owner_id uuid default auth.uid())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  if p_owner_id is null then
    return 0;
  end if;

  if p_owner_id <> auth.uid() and not public.is_platform_admin() then
    return 0;
  end if;

  update public.devices d
  set status = 'offline'
  where d.owner_id = p_owner_id
    and d.status = 'online'
    and (
      d.last_seen is null
      or d.last_seen < now() - interval '45 seconds'
    );

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.mark_stale_devices_offline(uuid) from public;
grant execute on function public.mark_stale_devices_offline(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin user directory (emails from auth.users, admin-only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  device_count bigint,
  online_device_count bigint
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
    count(d.id) filter (where d.status = 'online') as online_device_count
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  group by p.id, u.email, p.full_name, p.created_at
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;
