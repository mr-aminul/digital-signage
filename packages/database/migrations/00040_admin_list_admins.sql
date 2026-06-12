-- List platform admins for the admin portal (owners only).

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
  if not public.is_platform_admin() then
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
