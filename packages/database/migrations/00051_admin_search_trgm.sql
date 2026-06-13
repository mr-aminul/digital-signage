-- Faster admin search + trigram indexes on client email/name.

create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_client_name_trgm_idx
  on public.profiles using gin (lower(coalesce(client_name, '')) extensions.gin_trgm_ops);

-- auth.users email search joins in admin_list_users; index on lower(email) via expression on profiles join path.
-- Supabase stores emails in auth.users — staff search uses u.email from join.

create or replace function public.admin_list_users(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  email text,
  client_name text,
  created_at timestamptz,
  device_count bigint,
  online_device_count bigint,
  active_device_count bigint,
  device_limit integer,
  storage_used_bytes bigint,
  storage_limit_bytes bigint,
  is_disabled boolean,
  is_staff boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  if v_status not in ('all', 'active', 'disabled') then
    raise exception 'invalid_status_filter';
  end if;

  if v_limit > 200 then
    v_limit := 200;
  end if;

  return query
  with filtered as (
    select
      p.id,
      u.email::text as email,
      p.client_name,
      p.created_at,
      count(d.id) as device_count,
      count(d.id) filter (where d.status = 'online') as online_device_count,
      count(d.id) filter (where not d.paused_by_quota and not d.playback_disabled) as active_device_count,
      p.device_limit,
      p.storage_used_bytes,
      p.storage_limit_bytes,
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
      and (
        v_status = 'all'
        or (v_status = 'active' and not p.is_disabled)
        or (v_status = 'disabled' and p.is_disabled)
      )
      and (
        v_search is null
        or lower(u.email) like '%' || lower(v_search) || '%'
        or lower(coalesce(p.client_name, '')) like '%' || lower(v_search) || '%'
        or similarity(lower(coalesce(p.client_name, '')), lower(v_search)) > 0.25
        or similarity(lower(u.email::text), lower(v_search)) > 0.25
      )
    group by
      p.id,
      u.email,
      p.client_name,
      p.created_at,
      p.device_limit,
      p.storage_used_bytes,
      p.storage_limit_bytes,
      p.is_disabled
  )
  select
    f.id,
    f.email,
    f.client_name,
    f.created_at,
    f.device_count,
    f.online_device_count,
    f.active_device_count,
    f.device_limit,
    f.storage_used_bytes,
    f.storage_limit_bytes,
    f.is_disabled,
    f.is_staff,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.admin_list_users(integer, integer, text, text) from public;
grant execute on function public.admin_list_users(integer, integer, text, text) to authenticated;
