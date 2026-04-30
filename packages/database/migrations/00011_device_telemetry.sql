-- TV-reported device diagnostics (app, OS, display, network, etc.) for the admin console.
-- Writes use an RPC so jsonb and auth are explicit; the TV (anon) is scoped by registered_session_id.

alter table public.devices
  add column if not exists telemetry jsonb not null default '{}'::jsonb,
  add column if not exists telemetry_at timestamptz;

comment on column public.devices.telemetry is
  'JSON from the screen app: app/os/hardware/display/network/locale, etc.';

create or replace function public.tv_device_report_telemetry(
  p_device_id uuid,
  p_telemetry jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  update public.devices d
  set
    telemetry = coalesce(p_telemetry, '{}'::jsonb),
    telemetry_at = now()
  where d.id = p_device_id
    and d.registered_session_id = auth.uid();
end;
$$;

revoke all on function public.tv_device_report_telemetry(uuid, jsonb) from public;
grant execute on function public.tv_device_report_telemetry(uuid, jsonb) to anon, authenticated;
