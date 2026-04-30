-- Remove WebRTC signaling tables (replaced by telemetry.playback snapshots).

drop table if exists public.live_screen_signals cascade;
drop table if exists public.live_screen_sessions cascade;

drop function if exists public.request_live_screen_session(uuid);
drop function if exists public.end_live_screen_session(uuid);
drop function if exists public.tv_set_live_session_streaming(uuid);
