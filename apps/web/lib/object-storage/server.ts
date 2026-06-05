import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getObjectStorageServerConfig, type ObjectStorageServerConfig } from "./env";

let cachedClient: S3Client | null | undefined;

function getClient(): S3Client {
  if (cachedClient !== undefined) return cachedClient!;

  const config = getObjectStorageServerConfig();
  if (!config) {
    cachedClient = null;
    throw new Error(
      "Object storage is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY.",
    );
  }

  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: config.forcePathStyle,
  });

  return cachedClient;
}

function requireConfig(): ObjectStorageServerConfig {
  const config = getObjectStorageServerConfig();
  if (!config) {
    throw new Error(
      "Object storage is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY.",
    );
  }
  return config;
}

export function assertOwnerStoragePath(ownerId: string, storagePath: string): void {
  const normalized = storagePath.replace(/^\/+/, "");
  const prefix = `${ownerId}/`;
  if (!normalized.startsWith(prefix) || normalized.includes("..")) {
    throw new Error("Invalid storage path for this user.");
  }
}

export async function putMediaObject(
  ownerId: string,
  storagePath: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  assertOwnerStoragePath(ownerId, storagePath);
  const config = requireConfig();
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: config.mediaBucket,
      Key: storagePath.replace(/^\/+/, ""),
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=86400",
    }),
  );
}

export async function deleteMediaObject(ownerId: string, storagePath: string): Promise<void> {
  assertOwnerStoragePath(ownerId, storagePath);
  const config = requireConfig();
  const client = getClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.mediaBucket,
      Key: storagePath.replace(/^\/+/, ""),
    }),
  );
}
