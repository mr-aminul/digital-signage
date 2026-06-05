#!/usr/bin/env node
/**
 * One-time migration: copy objects from Supabase Storage to MinIO with the same keys.
 *
 * Usage (from apps/web):
 *   pnpm migrate:storage media
 *   pnpm migrate:storage releases
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or pass anon if objects are public)
 *   S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_MEDIA_BUCKET, S3_RELEASES_BUCKET
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const bucketKind = process.argv[2];
if (bucketKind !== "media" && bucketKind !== "releases") {
  console.error("Usage: node scripts/migrate-supabase-storage-to-minio.mjs <media|releases>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const s3Endpoint = process.env.S3_ENDPOINT?.trim();
const s3AccessKey = process.env.S3_ACCESS_KEY?.trim();
const s3SecretKey = process.env.S3_SECRET_KEY?.trim();
const s3MediaBucket = process.env.S3_MEDIA_BUCKET?.trim() || "onesign-media";
const s3ReleasesBucket = process.env.S3_RELEASES_BUCKET?.trim() || "onesign-releases";

for (const [name, value] of [
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["SUPABASE key", serviceKey],
  ["S3_ENDPOINT", s3Endpoint],
  ["S3_ACCESS_KEY", s3AccessKey],
  ["S3_SECRET_KEY", s3SecretKey],
]) {
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
}

const supabaseBucket = bucketKind === "media" ? "media" : "releases";
const minioBucket = bucketKind === "media" ? s3MediaBucket : s3ReleasesBucket;

const s3 = new S3Client({
  endpoint: s3Endpoint,
  region: process.env.S3_REGION?.trim() || "us-east-1",
  credentials: { accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

async function listAllObjects() {
  const objects = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/list/${supabaseBucket}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix: "", limit, offset }),
      },
    );
    if (!res.ok) {
      throw new Error(`List failed (${res.status}): ${await res.text()}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    objects.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return objects;
}

async function downloadObject(name) {
  const url = `${supabaseUrl}/storage/v1/object/${supabaseBucket}/${name
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  if (!res.ok) {
    throw new Error(`Download ${name} failed (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { buffer, contentType };
}

async function main() {
  console.log(`Migrating Supabase bucket "${supabaseBucket}" → MinIO "${minioBucket}"…`);
  const objects = await listAllObjects();
  console.log(`Found ${objects.length} objects`);

  let ok = 0;
  let failed = 0;

  for (const obj of objects) {
    const name = obj.name;
    if (!name) continue;
    try {
      const { buffer, contentType } = await downloadObject(name);
      await s3.send(
        new PutObjectCommand({
          Bucket: minioBucket,
          Key: name,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=86400",
        }),
      );
      ok += 1;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${name}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Done. ${ok} uploaded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
