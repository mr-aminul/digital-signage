-- Playlist-driven remote preview: merge `telemetry.playback` without replacing hardware diagnostics.
-- TV calls this when the slide or playlist context changes (plus throttled heartbeats).

create or replace function public.tv_merge_playback_snapshot(
  p_device_id uuid,
  p_playback jsonb
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
    telemetry = coalesce(d.telemetry, '{}'::jsonb) || jsonb_build_object('playback', coalesce(p_playback, '{}'::jsonb)),
    telemetry_at = now(),
    last_seen = now(),
    status = 'online'
  where d.id = p_device_id
    and d.registered_session_id = auth.uid();
end;
$$;

revoke all on function public.tv_merge_playback_snapshot(uuid, jsonb) from public;
grant execute on function public.tv_merge_playback_snapshot(uuid, jsonb) to anon, authenticated;

-- Hardware/report payloads merge into existing telemetry so playback RPC and full dumps compose.
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
    telemetry = coalesce(d.telemetry, '{}'::jsonb) || coalesce(p_telemetry, '{}'::jsonb),
    telemetry_at = now(),
    last_seen = now(),
    status = 'online'
  where d.id = p_device_id
    and d.registered_session_id = auth.uid();
end;
$$;

revoke all on function public.tv_device_report_telemetry(uuid, jsonb) from public;
grant execute on function public.tv_device_report_telemetry(uuid, jsonb) to anon, authenticated;
