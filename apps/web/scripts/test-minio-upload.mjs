#!/usr/bin/env node
/** Smoke test: upload a tiny PNG to MinIO and verify public URL. */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT?.trim();
const accessKey = process.env.S3_ACCESS_KEY?.trim();
const secretKey = process.env.S3_SECRET_KEY?.trim();
const bucket = process.env.S3_MEDIA_BUCKET?.trim() || "onesign-media";
const publicBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim().replace(/\/$/, "");

if (!endpoint || !accessKey || !secretKey || !publicBase) {
  console.error("Missing S3_* or NEXT_PUBLIC_MEDIA_BASE_URL in .env.local");
  process.exit(1);
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const key = `_smoke-test/${Date.now()}.png`;

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION?.trim() || "us-east-1",
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: png,
    ContentType: "image/png",
    CacheControl: "public, max-age=60",
  }),
);

const url = `${publicBase}/${key}`;
const res = await fetch(url);
if (!res.ok) {
  console.error(`Upload succeeded but public GET failed (${res.status}): ${url}`);
  process.exit(1);
}

console.log(`MinIO upload OK: ${url}`);
