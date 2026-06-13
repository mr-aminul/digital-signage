-- Paginated admin audit log for staff portal UI.

create or replace function public.admin_list_audit_log(
  p_limit integer default 50,
  p_offset integer default 0,
  p_target_user_id uuid default null,
  p_action text default null
)
returns table (
  id uuid,
  action text,
  actor_id uuid,
  actor_email text,
  actor_display_name text,
  target_user_id uuid,
  target_email text,
  target_client_name text,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_action text := nullif(trim(coalesce(p_action, '')), '');
begin
  if not public.is_platform_staff() then
    raise exception 'Forbidden';
  end if;

  if v_limit > 200 then
    v_limit := 200;
  end if;

  return query
  with filtered as (
    select
      l.id,
      l.action,
      l.actor_id,
      actor_u.email::text as actor_email,
      actor_staff.display_name as actor_display_name,
      l.target_user_id,
      target_u.email::text as target_email,
      target_p.client_name as target_client_name,
      l.metadata,
      l.created_at
    from public.admin_audit_log l
    join auth.users actor_u on actor_u.id = l.actor_id
    left join public.platform_staff actor_staff
      on actor_staff.user_id = l.actor_id
      and actor_staff.is_active
    left join auth.users target_u on target_u.id = l.target_user_id
    left join public.profiles target_p on target_p.id = l.target_user_id
    where (p_target_user_id is null or l.target_user_id = p_target_user_id)
      and (v_action is null or l.action = v_action)
  )
  select
    f.id,
    f.action,
    f.actor_id,
    f.actor_email,
    f.actor_display_name,
    f.target_user_id,
    f.target_email,
    f.target_client_name,
    f.metadata,
    f.created_at,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.admin_list_audit_log(integer, integer, uuid, text) from public;
grant execute on function public.admin_list_audit_log(integer, integer, uuid, text) to authenticated;
