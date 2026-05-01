import type { PlaylistItemWithMedia } from "@signage/types";

/** Seconds for timed summary; videos play in full and are counted separately. */
export function imageTimelineSeconds(item: PlaylistItemWithMedia): number {
  if (item.media.file_type === "video") return 0;
  return Math.max(0, item.duration_seconds ?? 10);
}

export function sumImageTimelineSeconds(items: PlaylistItemWithMedia[]): number {
  return items.reduce((acc, row) => acc + imageTimelineSeconds(row), 0);
}

function formatSec(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) return `${m}m`;
  return `${m}m ${rem}s`;
}

function sumKnownVideoIntrinsicSeconds(items: PlaylistItemWithMedia[]): number {
  return items.reduce((acc, row) => {
    if (row.media.file_type !== "video") return acc;
    const d = row.media.duration_seconds;
    if (d == null || !Number.isFinite(d) || d <= 0) return acc;
    return acc + d;
  }, 0);
}

/** Badge text: image dwell totals plus video count (with known runtime when available). */
export function formatPlaylistClockLabel(items: PlaylistItemWithMedia[]): string {
  const imageSec = sumImageTimelineSeconds(items);
  const videos = items.filter((i) => i.media.file_type === "video");
  const videoCount = videos.length;
  if (videoCount === 0) return formatSec(imageSec);
  const knownVideoSec = sumKnownVideoIntrinsicSeconds(items);
  const videoPart =
    knownVideoSec > 0
      ? `${videoCount} video${videoCount === 1 ? "" : "s"} (${formatSec(Math.round(knownVideoSec))})`
      : `${videoCount} video${videoCount === 1 ? "" : "s"}`;
  return `${formatSec(imageSec)} · ${videoPart}`;
}
