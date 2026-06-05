import type { Media, MediaFileType } from "@signage/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mediaPublicUrl as buildMediaPublicUrl } from "@/lib/object-storage/urls";
import {
  durationSecondsForStorage,
  probeVideoFileDurationSeconds,
  probeVideoUrlDurationSeconds,
} from "@/lib/video-duration-probe";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

export function inferMediaFileType(mime: string): MediaFileType {
  if (IMAGE_TYPES.has(mime)) return "image";
  if (VIDEO_TYPES.has(mime)) return "video";
  return "unknown";
}

export function isAcceptedSignageMime(mime: string): boolean {
  return inferMediaFileType(mime) !== "unknown";
}

export { buildMediaPublicUrl as mediaPublicUrl };

export { probeVideoUrlDurationSeconds } from "@/lib/video-duration-probe";

function isWebmStoragePath(storagePath: string): boolean {
  return storagePath.toLowerCase().endsWith(".webm");
}

/** Persist intrinsic video length on media (re-probes WebM — early metadata is often wrong). */
export async function ensureMediaVideoDuration(
  supabase: SupabaseClient,
  media: Pick<Media, "id" | "file_type" | "duration_seconds" | "storage_path">,
): Promise<number | null> {
  if (media.file_type !== "video") return null;

  const stored =
    media.duration_seconds != null && media.duration_seconds > 0
      ? media.duration_seconds
      : null;
  const mustReprobeWebm = isWebmStoragePath(media.storage_path);

  if (stored != null && !mustReprobeWebm) {
    return stored;
  }

  const probed = await probeVideoUrlDurationSeconds(buildMediaPublicUrl(media.storage_path));
  const rounded = durationSecondsForStorage(probed);
  if (rounded == null) return stored;

  if (stored != null && rounded <= stored) {
    return stored;
  }

  const { error } = await supabase.from("media").update({ duration_seconds: rounded }).eq("id", media.id);
  if (error) return stored;
  return rounded;
}

/** Browser-only: reads duration from a local video file before upload. */
export async function readVideoFileDurationSeconds(file: File): Promise<number | null> {
  return probeVideoFileDurationSeconds(file);
}
