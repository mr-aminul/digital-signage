/** Public HTTPS base including bucket path, e.g. https://s3.example.com/onesign-media */
export function getMediaPublicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").trim().replace(/\/$/, "");
}

/** Public HTTPS base including bucket path, e.g. https://s3.example.com/onesign-releases */
export function getReleasesPublicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_RELEASES_BASE_URL ?? "").trim().replace(/\/$/, "");
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
