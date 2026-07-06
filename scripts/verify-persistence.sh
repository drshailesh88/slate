#!/usr/bin/env bash
# Spin an ephemeral docker Postgres, run the canvas persistence round-trip
# against it, then tear it down. No live Neon creds required.
set -euo pipefail

CONTAINER="slate-canvas-verify-pg"
PORT="55432"
PASSWORD="postgres"
export DATABASE_URL="postgres://postgres:${PASSWORD}@127.0.0.1:${PORT}/postgres"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
echo "Starting ephemeral Postgres (${CONTAINER}) on :${PORT}…"
docker run -d --name "${CONTAINER}" \
  -e POSTGRES_PASSWORD="${PASSWORD}" \
  -p "${PORT}:5432" \
  postgres:16-alpine >/dev/null

echo "Waiting for Postgres to accept connections…"
for i in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "${i}" -eq 30 ]; then
    echo "Postgres did not become ready in time." >&2
    exit 1
  fi
done

echo ""
node scripts/verify-persistence.mjs
