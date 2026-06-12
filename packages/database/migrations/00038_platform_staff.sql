-- Platform staff (operators) are separate from client profiles.
-- Replaces profiles.is_admin for all admin / cross-tenant access.

create table if not exists public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'operator'
    check (role in ('owner', 'operator', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists platform_staff_email_lower_idx
  on public.platform_staff (lower(email));

comment on table public.platform_staff is
  'OneSign platform operators (admin portal). Not client accounts.';

alter table public.platform_staff enable row level security;

drop policy if exists platform_staff_select_self on public.platform_staff;
create policy platform_staff_select_self on public.platform_staff
  for select using (user_id = auth.uid());

-- Migrate existing profile admins, then seed known operator emails.
insert into public.platform_staff (user_id, email, display_name, role)
select
  p.id,
  u.email::text,
  coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1)),
  'owner'
from public.profiles p
join auth.users u on u.id = p.id
where p.is_admin = true
on conflict (user_id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, platform_staff.display_name),
    role = 'owner',
    is_active = true;

insert into public.platform_staff (user_id, email, display_name, role)
select
  u.id,
  u.email::text,
  coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1)),
  'owner'
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('aminulislamborhan@gmail.com')
on conflict (user_id) do update
  set is_active = true, role = 'owner';

create or replace function public.is_platform_admin()
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

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Client directory: dashboard users only, exclude platform staff.
drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  device_count bigint,
  online_device_count bigint,
  is_disabled boolean
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
    p.is_disabled
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.devices d on d.owner_id = p.id
  where u.is_anonymous = false
    and u.email is not null
    and not exists (
      select 1
      from public.platform_staff s
      where s.user_id = p.id
        and s.is_active
    )
  group by p.id, u.email, p.full_name, p.created_at, p.is_disabled
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- Cannot disable platform staff via client account controls.
create or replace function public.admin_set_account_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
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

-- Owners can invite additional platform operators by email (must already have signed up once).
create or replace function public.admin_upsert_staff(
  p_email text,
  p_display_name text default null,
  p_role text default 'operator'
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_role text := coalesce(nullif(trim(p_role), ''), 'operator');
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid()
      and s.is_active
      and s.role = 'owner'
  ) then
    raise exception 'Only platform owners can manage staff';
  end if;

  if v_role not in ('owner', 'operator', 'viewer') then
    raise exception 'Invalid role';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No account found for that email — ask them to sign up first';
  end if;

  insert into public.platform_staff (user_id, email, display_name, role, is_active)
  values (
    v_user_id,
    trim(p_email),
    nullif(trim(p_display_name), ''),
    v_role,
    true
  )
  on conflict (user_id) do update
    set
      email = excluded.email,
      display_name = coalesce(excluded.display_name, platform_staff.display_name),
      role = excluded.role,
      is_active = true;
end;
$$;

revoke all on function public.admin_upsert_staff(text, text, text) from public;
grant execute on function public.admin_upsert_staff(text, text, text) to authenticated;

alter table public.profiles drop column if exists is_admin;
