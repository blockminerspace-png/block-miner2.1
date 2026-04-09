#!/usr/bin/env bash
#
# BlockMiner — safe production deploy helper (run ON the server over SSH).
# - Does NOT run: prisma migrate, db push, seed, DROP/TRUNCATE, or any schema change.
# - Optional: pg_dump backup (read-only), tarball of app directory, git pull, docker compose rebuild app.
#
# Usage:
#   chmod +x scripts/deploy-production-safe.sh
#   export APP_ROOT=/root/block-miner
#   export GIT_BRANCH=main
#   export RUN_PG_DUMP=1   # optional; requires DATABASE_URL in environment
#   ./scripts/deploy-production-safe.sh
#
set -euo pipefail

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

APP_ROOT="${APP_ROOT:-/root/block-miner}"
GIT_BRANCH="${GIT_BRANCH:-main}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/blockminer}"
RUN_PG_DUMP="${RUN_PG_DUMP:-0}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"

log "Starting safe deploy; APP_ROOT=$APP_ROOT branch=$GIT_BRANCH"

if [[ ! -d "$APP_ROOT/.git" ]]; then
  log "ERROR: APP_ROOT is not a git clone: $APP_ROOT"
  exit 1
fi

mkdir -p "$BACKUP_ROOT"

log "Pre-check: disk space"
df -h "$APP_ROOT" "$BACKUP_ROOT" || true

log "Recording pre-deploy commit"
(cd "$APP_ROOT" && git rev-parse HEAD) | tee "$BACKUP_ROOT/pre_${TS}.commit"

log "Creating application directory tarball backup"
tar czf "$BACKUP_ROOT/app_${TS}.tar.gz" -C "$(dirname "$APP_ROOT")" "$(basename "$APP_ROOT")"
log "Backup saved: $BACKUP_ROOT/app_${TS}.tar.gz"

if [[ "$RUN_PG_DUMP" == "1" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "ERROR: RUN_PG_DUMP=1 but DATABASE_URL is not set"
    exit 1
  fi
  log "Creating PostgreSQL logical backup (pg_dump, read-only)"
  pg_dump "$DATABASE_URL" -Fc -f "$BACKUP_ROOT/blockminer_${TS}.dump"
  log "DB backup saved: $BACKUP_ROOT/blockminer_${TS}.dump"
fi

log "Git fetch / pull (ff-only)"
cd "$APP_ROOT"
git fetch origin
git checkout "$GIT_BRANCH"
git pull --ff-only "origin" "$GIT_BRANCH"
log "Post-pull commit: $(git rev-parse HEAD)"

if command -v docker >/dev/null 2>&1; then
  log "Docker Compose: build and restart app service only"
  docker compose build app
  docker compose up -d --no-deps app
else
  log "WARN: docker not found; skip container restart. Install deps / PM2 manually."
fi

log "Health check (local)"
curl -sS -o /dev/null -w "health_http:%{http_code}\n" http://127.0.0.1:3000/health || log "WARN: local health request failed"

log "Deploy script finished OK. Monitor logs: docker compose logs -f --tail=100 app"
