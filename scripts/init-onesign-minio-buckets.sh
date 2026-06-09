#!/usr/bin/env bash
# Create OneSign MinIO buckets on the VPS (run via SSH on the server or from deploy host with mc configured).
set -euo pipefail

MINIO_ALIAS="${MINIO_ALIAS:-local}"
MEDIA_BUCKET="${S3_MEDIA_BUCKET:-onesign-media}"
RELEASES_BUCKET="${S3_RELEASES_BUCKET:-onesign-releases}"

echo "Creating buckets: ${MEDIA_BUCKET}, ${RELEASES_BUCKET}"

mc alias list "${MINIO_ALIAS}" >/dev/null 2>&1 || {
  echo "MinIO alias '${MINIO_ALIAS}' not found. Configure mc first, e.g.:"
  echo "  mc alias set local https://s3.storage.inventivelab.bd ACCESS_KEY SECRET_KEY"
  exit 1
}

mc mb --ignore-existing "${MINIO_ALIAS}/${MEDIA_BUCKET}"
mc mb --ignore-existing "${MINIO_ALIAS}/${RELEASES_BUCKET}"

# Public read for TV playback and APK downloads (same as former Supabase public buckets).
mc anonymous set download "${MINIO_ALIAS}/${MEDIA_BUCKET}"
mc anonymous set download "${MINIO_ALIAS}/${RELEASES_BUCKET}"

echo "Done. Public URLs:"
S3_PUBLIC_HOST="${S3_PUBLIC_HOST:-s3.storage.inventivelab.bd}"
echo "  Media:    https://${S3_PUBLIC_HOST}/${MEDIA_BUCKET}/<ownerId>/<file>"
echo "  Releases: https://${S3_PUBLIC_HOST}/${RELEASES_BUCKET}/<path>"
