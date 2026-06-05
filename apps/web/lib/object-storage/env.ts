function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export type ObjectStorageServerConfig = {
  endpoint: string;
  region: string;
  mediaBucket: string;
  releasesBucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
};

export function getObjectStorageServerConfig(): ObjectStorageServerConfig | null {
  const endpoint = firstNonEmpty(process.env.S3_ENDPOINT);
  const accessKey = firstNonEmpty(process.env.S3_ACCESS_KEY);
  const secretKey = firstNonEmpty(process.env.S3_SECRET_KEY);
  const mediaBucket = firstNonEmpty(process.env.S3_MEDIA_BUCKET, "onesign-media");
  const releasesBucket = firstNonEmpty(process.env.S3_RELEASES_BUCKET, "onesign-releases");

  if (!endpoint || !accessKey || !secretKey) {
    return null;
  }

  return {
    endpoint,
    region: firstNonEmpty(process.env.S3_REGION, "us-east-1")!,
    mediaBucket: mediaBucket!,
    releasesBucket: releasesBucket!,
    accessKey,
    secretKey,
    forcePathStyle: firstNonEmpty(process.env.S3_FORCE_PATH_STYLE, "true") !== "false",
  };
}

export function isObjectStorageConfigured(): boolean {
  return getObjectStorageServerConfig() !== null;
}
