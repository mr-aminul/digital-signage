-- Harden admin portal: enforce account suspension in RLS, real staff RBAC (viewer = read-only),
-- and single-client admin lookup.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select not p.is_disabled from public.profiles p where p.id = auth.uid()),
    true
  );
$$;

revoke all on function public.is_account_active() from public;
grant execute on function public.is_account_active() to authenticated;

comment on function public.is_account_active() is
  'False when the signed-in user profile is suspended (is_disabled).';

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_staff s
    where s.user_id = auth.uid()
      and s.is_active
  );
$$;

revoke all on function public.is_platform_staff() from public;
grant execute on function public.is_platform_staff() to authenticated;

comment on function public.is_platform_staff() is
  'Any active platform staff (owner, operator, or viewer). Read-only admin access.';

create or replace function public.is_platform_staff_writer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role in ('owner', 'operator')
  );
$$;

revoke all on function public.is_platform_staff_writer() from public;
grant execute on function public.is_platform_staff_writer() to authenticated;

comment on function public.is_platform_staff_writer() is
  'Platform staff with write access (owner or operator). Viewers excluded.';

-- Backward-compatible name used by triggers and legacy call sites: writers only.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_staff_writer();
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id or public.is_platform_staff());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id and public.is_account_active());

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------

drop policy if exists devices_select_access on public.devices;
create policy devices_select_access on public.devices
  for select using (
    auth.uid() = owner_id
    or auth.uid() = registered_session_id
    or public.is_platform_staff()
  );

drop policy if exists devices_update_owner on public.devices;
create policy devices_update_owner on public.devices
  for update using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

drop policy if exists devices_update_claim_by_code on public.devices;
create policy devices_update_claim_by_code on public.devices
  for update using (
    owner_id is null
    and auth.uid() is not null
    and public.is_account_active()
  )
  with check (owner_id = auth.uid());

drop policy if exists devices_delete_owner on public.devices;
create policy devices_delete_owner on public.devices
  for delete using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------

drop policy if exists media_select_own on public.media;
create policy media_select_own on public.media
  for select using (auth.uid() = owner_id or public.is_platform_staff());

drop policy if exists media_insert_own on public.media;
create policy media_insert_own on public.media
  for insert with check (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

drop policy if exists media_update_own on public.media;
create policy media_update_own on public.media
  for update using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

drop policy if exists media_delete_own on public.media;
create policy media_delete_own on public.media
  for delete using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

-- ---------------------------------------------------------------------------
-- Playlists
-- ---------------------------------------------------------------------------

drop policy if exists playlists_select_own on public.playlists;
create policy playlists_select_own on public.playlists
  for select using (auth.uid() = owner_id or public.is_platform_staff());

drop policy if exists playlists_insert_own on public.playlists;
create policy playlists_insert_own on public.playlists
  for insert with check (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

drop policy if exists playlists_update_own on public.playlists;
create policy playlists_update_own on public.playlists
  for update using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

drop policy if exists playlists_delete_own on public.playlists;
create policy playlists_delete_own on public.playlists
  for delete using (
    (auth.uid() = owner_id and public.is_account_active())
    or public.is_platform_staff_writer()
  );

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
    or public.is_platform_staff()
  );

drop policy if exists playlist_items_insert_own on public.playlist_items;
create policy playlist_items_insert_own on public.playlist_items
  for insert with check (
    (
      exists (
        select 1 from public.playlists p
        where p.id = playlist_id and p.owner_id = auth.uid()
      )
      and public.is_account_active()
    )
    or public.is_platform_staff_writer()
  );

drop policy if exists playlist_items_update_own on public.playlist_items;
create policy playlist_items_update_own on public.playlist_items
  for update using (
    (
      exists (
        select 1 from public.playlists p
        where p.id = playlist_id and p.owner_id = auth.uid()
      )
      and public.is_account_active()
    )
    or public.is_platform_staff_writer()
  );

drop policy if exists playlist_items_delete_own on public.playlist_items;
create policy playlist_items_delete_own on public.playlist_items
  for delete using (
    (
      exists (
        select 1 from public.playlists p
        where p.id = playlist_id and p.owner_id = auth.uid()
      )
      and public.is_account_active()
    )
    or public.is_platform_staff_writer()
  );

-- ---------------------------------------------------------------------------
-- Device playlists
-- ---------------------------------------------------------------------------

drop policy if exists device_playlists_select on public.device_playlists;
create policy device_playlists_select on public.device_playlists
  for select using (
    exists (
      select 1
      from public.devices d
      where d.id = device_id
        and (d.owner_id = auth.uid() or d.registered_session_id = auth.uid())
    )
    or public.is_platform_staff()
  );

drop policy if exists device_playlists_insert_owner on public.device_playlists;
create policy device_playlists_insert_owner on public.device_playlists
  for insert with check (
    public.is_account_active()
    and exists (
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
    public.is_account_active()
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid()
    )
  )
  with check (
    public.is_account_active()
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid()
    )
  );

drop policy if exists device_playlists_delete_owner on public.device_playlists;
create policy device_playlists_delete_owner on public.device_playlists
  for delete using (
    public.is_account_active()
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid()
    )
  );

drop policy if exists device_playlists_insert_admin on public.device_playlists;
create policy device_playlists_insert_admin on public.device_playlists
  for insert with check (public.is_platform_staff_writer());

drop policy if exists device_playlists_update_admin on public.device_playlists;
create policy device_playlists_update_admin on public.device_playlists
  for update using (public.is_platform_staff_writer())
  with check (public.is_platform_staff_writer());

drop policy if exists device_playlists_delete_admin on public.device_playlists;
create policy device_playlists_delete_admin on public.device_playlists
  for delete using (public.is_platform_staff_writer());

-- ---------------------------------------------------------------------------
-- Storage (media bucket)
-- ---------------------------------------------------------------------------

drop policy if exists media_objects_select on storage.objects;
create policy media_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_staff()
    )
  );

drop policy if exists media_objects_insert on storage.objects;
create policy media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_account_active())
      or public.is_platform_staff_writer()
    )
  );

drop policy if exists media_objects_update on storage.objects;
create policy media_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_account_active())
      or public.is_platform_staff_writer()
    )
  );

drop policy if exists media_objects_delete on storage.objects;
create policy media_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_account_active())
      or public.is_platform_staff_writer()
    )
  );

-- ---------------------------------------------------------------------------
-- Admin RPCs: staff read vs writer
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_client(p_user_id uuid)
returns table (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  device_count bigint,
  online_device_count bigint,
  is_disabled boolean,
  is_staff boolean
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
    p.full_name,
    p.created_at,
    count(d.id) as device_count,
    count(d.id) filter (where d.status = 'online') as online_device_count,
    p.is_disabled,
    exists (
      select 1
      from public.platform_staff s
      where s.user_id = p.id
        and s.is_active
    ) as is_staff
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  where p.id = p_user_id
    and u.is_anonymous = false
    and u.email is not null
  group by p.id, u.email, p.full_name, p.created_at, p.is_disabled;
end;
$$;

revoke all on function public.admin_get_client(uuid) from public;
grant execute on function public.admin_get_client(uuid) to authenticated;

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
  is_staff boolean
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
    p.id,
    u.email::text,
    p.full_name,
    p.created_at,
    count(d.id) as device_count,
    count(d.id) filter (where d.status = 'online') as online_device_count,
    p.is_disabled,
    exists (
      select 1
      from public.platform_staff s
      where s.user_id = p.id
        and s.is_active
    ) as is_staff
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  where u.is_anonymous = false
    and u.email is not null
  group by p.id, u.email, p.full_name, p.created_at, p.is_disabled
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_list_admins()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.platform_staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role = 'owner'
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    s.user_id,
    s.email,
    s.display_name,
    s.role,
    s.is_active,
    s.created_at
  from public.platform_staff s
  where s.is_active
  order by s.created_at asc;
end;
$$;

revoke all on function public.admin_list_admins() from public;
grant execute on function public.admin_list_admins() to authenticated;

create or replace function public.admin_set_account_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  if p_owner_id <> auth.uid()
     and not public.is_platform_staff_writer() then
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
