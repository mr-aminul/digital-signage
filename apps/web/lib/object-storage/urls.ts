function trimBaseUrl(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\/$/, "");
}

function supabasePublicStorageBase(bucket: string): string {
  const supabaseUrl = trimBaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseUrl) return "";
  return `${supabaseUrl}/storage/v1/object/public/${bucket}`;
}

/** Public HTTPS base including bucket path, e.g. https://s3.example.com/onesign-media */
export function getMediaPublicBaseUrl(): string {
  const minioBase = trimBaseUrl(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
  return minioBase || supabasePublicStorageBase("media");
}

/** Public HTTPS base including bucket path, e.g. https://s3.example.com/onesign-releases */
export function getReleasesPublicBaseUrl(): string {
  const minioBase = trimBaseUrl(process.env.NEXT_PUBLIC_RELEASES_BASE_URL);
  return minioBase || supabasePublicStorageBase("releases");
}

export function encodeStoragePath(storagePath: string): string {
  return storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function objectPublicUrl(baseUrl: string, storagePath: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const path = encodeStoragePath(storagePath.replace(/^\/+/, ""));
  return `${base}/${path}`;
}

export function mediaPublicUrl(storagePath: string): string {
  return objectPublicUrl(getMediaPublicBaseUrl(), storagePath);
}

export function releasePublicUrl(storagePath: string): string {
  return objectPublicUrl(getReleasesPublicBaseUrl(), storagePath);
}
