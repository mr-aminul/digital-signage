-- Dashboard-controlled preferred playback orientation for each TV (Android applies via Activity).

alter table public.devices
  add column if not exists screen_orientation text not null default 'landscape';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'devices_screen_orientation_check'
  ) then
    alter table public.devices
      add constraint devices_screen_orientation_check
      check (screen_orientation in ('landscape', 'portrait'));
  end if;
end $$;

comment on column public.devices.screen_orientation is
  'Preferred playback orientation (landscape or portrait). TV polls devices row and applies.';
