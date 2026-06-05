#!/usr/bin/env node
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT?.trim() || "https://s3.steakandmarrow.inventivelab.bd";
const accessKey = process.env.S3_ACCESS_KEY?.trim();
const secretKey = process.env.S3_SECRET_KEY?.trim();
const mediaBucket = process.env.S3_MEDIA_BUCKET?.trim() || "onesign-media";
const releasesBucket = process.env.S3_RELEASES_BUCKET?.trim() || "onesign-releases";

if (!accessKey || !secretKey) {
  console.error("Set S3_ACCESS_KEY and S3_SECRET_KEY");
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION?.trim() || "us-east-1",
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

function publicReadPolicy(bucket) {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

async function ensureBucket(name) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: name }));
    console.log(`Bucket exists: ${name}`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`Created bucket: ${name}`);
  }

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: name,
      Policy: publicReadPolicy(name),
    }),
  );
  console.log(`Public read policy set: ${name}`);
}

for (const bucket of [mediaBucket, releasesBucket]) {
  await ensureBucket(bucket);
}

console.log("Done.");
