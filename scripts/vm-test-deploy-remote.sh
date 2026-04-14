#!/bin/bash
# Run on test VPS after git pull (invoked by plink -m).
set -euo pipefail
REPO_DIR="${BLOCKMINER_REPO_DIR:-/root/block-miner}"
REPO_URL="${BLOCKMINER_REPO_URL:-https://github.com/blockminerspace-png/block-miner-v3.git}"

if [ ! -d "$REPO_DIR/.git" ]; then
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
git remote set-url origin "$REPO_URL"
git fetch origin
git reset --hard origin/main

if [ ! -f .env.production ]; then
  echo "ERROR: $REPO_DIR/.env.production is missing. Create it from .env.example before deploy."
  exit 1
fi

export COMPOSE_DOCKER_CLI_BUILD=1
export DOCKER_BUILDKIT=1
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d

echo "Waiting for app container..."
sleep 8
for i in 1 2 3 4 5; do
  if docker compose --env-file .env.production exec -T app true 2>/dev/null; then
    break
  fi
  sleep 3
done

docker compose --env-file .env.production exec -T app npx prisma migrate deploy --schema=server/prisma/schema.prisma || {
  echo "WARN: prisma migrate deploy failed (check DB / migrations)."
}

docker compose --env-file .env.production ps
curl -sS -m 15 "http://127.0.0.1:3000/health" && echo "" || echo "WARN: health check HTTP request failed (app may still be starting)."

echo "Deploy script finished."
