-- Staff members can also be client accounts (own devices, playlists, media).
-- Include them in the admin client directory; flag rows for UI.

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
