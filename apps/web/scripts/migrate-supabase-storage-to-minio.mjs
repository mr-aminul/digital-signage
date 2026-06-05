#!/usr/bin/env node
/**
 * One-time migration: copy objects from Supabase Storage to MinIO with the same keys.
 *
 * Usage (from apps/web):
 *   pnpm migrate:storage media
 *   pnpm migrate:storage releases
 */
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const bucketKind = process.argv[2];
if (bucketKind !== "media" && bucketKind !== "releases") {
  console.error("Usage: pnpm migrate:storage <media|releases>");
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

async function listPrefix(prefix) {
  const objects = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/list/${supabaseBucket}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix, limit, offset }),
    });
    if (!res.ok) {
      throw new Error(`List failed (${res.status}) for prefix "${prefix}": ${await res.text()}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    objects.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return objects;
}

async function listViaStorageApi() {
  const top = await listPrefix("");
  const files = top.filter((obj) => obj.name?.includes("."));
  if (files.length > 0) {
    return files.map((obj) => ({ name: obj.name }));
  }

  const nested = [];
  for (const entry of top) {
    const folder = entry.name?.replace(/\/$/, "");
    if (!folder || folder.includes(".")) continue;
    const children = await listPrefix(`${folder}/`);
    for (const child of children) {
      if (!child.name) continue;
      nested.push({ name: `${folder}/${child.name}`.replace(/\/+/g, "/") });
    }
  }
  return nested;
}

async function listViaDatabase() {
  if (bucketKind !== "media") return [];
  const res = await fetch(`${supabaseUrl}/rest/v1/media?select=storage_path`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  });
  if (!res.ok) {
    throw new Error(`media table query failed (${res.status}): ${await res.text()}`);
  }
  const rows = await res.json();
  return (rows ?? []).map((row) => ({ name: row.storage_path }));
}

async function listAllObjects() {
  try {
    const fromApi = await listViaStorageApi();
    const files = fromApi.filter((obj) => obj.name && obj.name.includes("."));
    if (files.length > 0) {
      console.log(`Found ${files.length} files via Supabase Storage API`);
      return files;
    }
  } catch (err) {
    console.warn("Storage list API failed:", err instanceof Error ? err.message : err);
  }

  if (bucketKind === "media") {
    try {
      const fromDb = await listViaDatabase();
      if (fromDb.length > 0) {
        console.log(`Using ${fromDb.length} storage_path rows from public.media`);
        return fromDb;
      }
    } catch (err) {
      console.warn("media table query failed:", err instanceof Error ? err.message : err);
    }
  }

  return [];
}

async function minioHasObject(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: minioBucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadObject(name) {
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${name
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  let res = await fetch(publicUrl);
  if (!res.ok) {
    const authedUrl = `${supabaseUrl}/storage/v1/object/${supabaseBucket}/${name
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    res = await fetch(authedUrl, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
  }
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

  if (objects.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const obj of objects) {
    const name = obj.name;
    if (!name) continue;
    if (await minioHasObject(name)) {
      skipped += 1;
      console.log(`  ⊘ ${name} (already in MinIO)`);
      continue;
    }
    try {
      console.log(`  … ${name} (downloading)`);
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

  console.log(`Done. ${ok} uploaded, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
