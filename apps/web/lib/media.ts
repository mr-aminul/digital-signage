import type { MediaFileType } from "@signage/types";

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

/** Browser-only: reads duration from a local video file before upload. */
export async function readVideoFileDurationSeconds(file: File): Promise<number | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number | null>((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      const finish = (value: number | null) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      video.onloadedmetadata = () => {
        const d = video.duration;
        finish(Number.isFinite(d) && d > 0 ? d : null);
      };
      video.onerror = () => finish(null);
      video.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
