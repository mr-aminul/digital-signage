#!/usr/bin/env bash
# Add s3.storage.inventivelab.bd to Caddy (MinIO reverse proxy on this VPS).
# Run on the VPS as root after DNS A record points here:
#   s3.storage.inventivelab.bd → 217.154.53.60
#
# Usage:
#   scp scripts/vps-add-s3-storage-host.sh root@217.154.53.60:/root/
#   ssh root@217.154.53.60 'bash /root/vps-add-s3-storage-host.sh'

set -euo pipefail

NEW_HOST="s3.storage.inventivelab.bd"
MINIO_UPSTREAM="${MINIO_UPSTREAM:-127.0.0.1:9000}"

CADDYFILE=""
for candidate in /etc/caddy/Caddyfile /etc/Caddyfile; do
  if [[ -f "$candidate" ]]; then
    CADDYFILE="$candidate"
    break
  fi
done

if [[ -z "$CADDYFILE" ]]; then
  echo "Caddyfile not found under /etc/caddy/ or /etc/."
  exit 1
fi

if grep -q "$NEW_HOST" "$CADDYFILE"; then
  echo "Caddy already lists $NEW_HOST."
else
  cp "$CADDYFILE" "${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
  cat >> "$CADDYFILE" <<EOF

${NEW_HOST} {
	reverse_proxy ${MINIO_UPSTREAM}
}
EOF
  echo "Appended ${NEW_HOST} → ${MINIO_UPSTREAM} to ${CADDYFILE}"
fi

caddy validate --config "$CADDYFILE"
systemctl reload caddy || systemctl restart caddy

echo ""
echo "Done. After DNS propagates, verify:"
echo "  curl -sI https://${NEW_HOST}/onesign-media/ | head -5"
echo ""
echo "Keep s3.steakandmarrow.inventivelab.bd in Caddy until deployed TVs are rebuilt."
