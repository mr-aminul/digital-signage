import type { Media } from "@signage/types";
import { inferMediaFileType, isAcceptedSignageMime } from "@/lib/media";

export const MEDIA_UPLOAD_ACCEPT = {
  "image/jpeg": [],
  "image/png": [],
  "image/webp": [],
  "video/mp4": [],
  "video/webm": [],
} as const;

export async function uploadMediaFiles(
  files: File[],
): Promise<{ uploaded: Media[]; errors: string[] }> {
  const uploaded: Media[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!isAcceptedSignageMime(file.type)) {
      errors.push(`${file.name} is not a supported image/video type.`);
      continue;
    }

    const formData = new FormData();
    formData.append("file", file);

    let response: Response;
    try {
      response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });
    } catch {
      errors.push(`${file.name}: network error during upload.`);
      continue;
    }

    let payload: { media?: Media; error?: string };
    try {
      payload = (await response.json()) as { media?: Media; error?: string };
    } catch {
      errors.push(`${file.name}: invalid server response.`);
      continue;
    }

    if (!response.ok || !payload.media) {
      errors.push(payload.error ?? `${file.name}: upload failed.`);
      continue;
    }

    uploaded.push(payload.media);
  }

  return { uploaded, errors };
}

export { inferMediaFileType, isAcceptedSignageMime };
