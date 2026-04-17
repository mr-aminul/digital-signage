-- Dashboard user cannot SELECT unclaimed devices (RLS: only owner or TV session).
-- The RPC ran as SECURITY INVOKER, so the UPDATE saw 0 rows. Run as definer so
-- the validated update applies while auth.uid() still identifies the caller.
create or replace function public.link_device_by_pairing_code(p_code text, p_name text default null)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.devices;
begin
  if p_code !~ '^[0-9]{6}$' then
    raise exception 'invalid_pairing_code';
  end if;

  update public.devices d
  set
    owner_id = auth.uid(),
    name = coalesce(nullif(trim(p_name), ''), d.name),
    status = 'pending_pairing'
  where d.pairing_code = p_code
    and d.owner_id is null
  returning * into strict result;

  return result;
exception
  when no_data_found then
    raise exception 'device_not_found_or_already_linked';
end;
$$;

grant execute on function public.link_device_by_pairing_code(text, text) to authenticated;
