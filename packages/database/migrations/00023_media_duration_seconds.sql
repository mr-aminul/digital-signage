-- Intrinsic video length for display in the console; playlist_items.duration_seconds is image dwell only.

alter table public.media
  add column if not exists duration_seconds double precision;

comment on column public.media.duration_seconds is
  'Length of video assets in seconds (null for images, unknown, or legacy rows).';

update public.playlist_items pi
set duration_seconds = null
from public.media m
where pi.media_id = m.id
  and m.file_type = 'video';
