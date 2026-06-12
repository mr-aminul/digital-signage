-- Only platform admins may pause or resume playlist playback on a screen.

create or replace function public.enforce_playback_disabled_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.playback_disabled is distinct from old.playback_disabled
     and not public.is_platform_admin() then
    raise exception 'Only platform admins can pause or resume screens'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists devices_playback_disabled_admin_only on public.devices;
create trigger devices_playback_disabled_admin_only
  before update of playback_disabled on public.devices
  for each row
  execute function public.enforce_playback_disabled_admin_only();
