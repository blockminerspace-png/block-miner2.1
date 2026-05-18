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
#   export SKIP_APP_TARBALL=1   # optional; skip full-app tar (disk / CI)
#   export DEPLOY_GIT_MODE=reset|ff-only   # default reset (CI-safe); ff-only keeps pull --ff-only
#   export START_NGINX_PROXY=1   # optional; docker compose --profile proxy up -d nginx
#   export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1   # optional; docker compose build --no-cache app (slower, no layer reuse)
#   ./scripts/deploy-production-safe.sh
#
set -euo pipefail

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

APP_ROOT="${APP_ROOT:-/root/block-miner}"
GIT_BRANCH="${GIT_BRANCH:-main}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/blockminer}"
RUN_PG_DUMP="${RUN_PG_DUMP:-0}"
SKIP_APP_TARBALL="${SKIP_APP_TARBALL:-0}"
DEPLOY_GIT_MODE="${DEPLOY_GIT_MODE:-reset}"
START_NGINX_PROXY="${START_NGINX_PROXY:-0}"
BLOCKMINER_DOCKER_BUILD_NO_CACHE="${BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"

log "Starting safe deploy; APP_ROOT=$APP_ROOT branch=$GIT_BRANCH"

if [[ ! -d "$APP_ROOT/.git" ]]; then
  log "ERROR: APP_ROOT is not a git clone: $APP_ROOT"
  exit 1
fi

mkdir -p "$BACKUP_ROOT"

if [[ "${DEPLOY_PRISMA_MIGRATE_DEPLOY:-0}" == "1" ]]; then
  log "ERROR: DEPLOY_PRISMA_MIGRATE_DEPLOY=1 is forbidden in safe mode."
  exit 1
fi

if [[ -f "$APP_ROOT/.env.production" ]]; then
  bootstrap_line="$(grep -E '^[[:space:]]*DB_BOOTSTRAP_ON_STARTUP=' "$APP_ROOT/.env.production" | tail -n1 || true)"
  if [[ -n "$bootstrap_line" ]]; then
    bootstrap_value="${bootstrap_line#*=}"
    bootstrap_value="${bootstrap_value//\"/}"
    bootstrap_value="${bootstrap_value//\'/}"
    bootstrap_value="$(echo "$bootstrap_value" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    if [[ "$bootstrap_value" == "1" || "$bootstrap_value" == "true" || "$bootstrap_value" == "yes" || "$bootstrap_value" == "on" ]]; then
      log "ERROR: .env.production enables DB_BOOTSTRAP_ON_STARTUP. Safe mode refuses to continue."
      exit 1
    fi
  fi
fi

log "Pre-check: disk space"
df -h "$APP_ROOT" "$BACKUP_ROOT" || true

log "Recording pre-deploy commit"
(cd "$APP_ROOT" && git rev-parse HEAD) | tee "$BACKUP_ROOT/pre_${TS}.commit"

if [[ "$SKIP_APP_TARBALL" == "1" ]]; then
  log "Skipping application tarball (SKIP_APP_TARBALL=1)"
else
  log "Creating application directory tarball backup"
  tar czf "$BACKUP_ROOT/app_${TS}.tar.gz" -C "$(dirname "$APP_ROOT")" "$(basename "$APP_ROOT")"
  log "Backup saved: $BACKUP_ROOT/app_${TS}.tar.gz"
fi

if [[ "$RUN_PG_DUMP" == "1" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "ERROR: RUN_PG_DUMP=1 but DATABASE_URL is not set"
    exit 1
  fi
  log "Creating PostgreSQL logical backup (pg_dump, read-only)"
  pg_dump "$DATABASE_URL" -Fc -f "$BACKUP_ROOT/blockminer_${TS}.dump"
  log "DB backup saved: $BACKUP_ROOT/blockminer_${TS}.dump"
fi

log "Git fetch / update ($DEPLOY_GIT_MODE)"
cd "$APP_ROOT"
git fetch origin
git checkout "$GIT_BRANCH"
if [[ "$DEPLOY_GIT_MODE" == "ff-only" ]]; then
  git pull --ff-only "origin" "$GIT_BRANCH"
else
  git reset --hard "origin/$GIT_BRANCH"
fi
log "Post-update commit: $(git rev-parse HEAD)"

if command -v docker >/dev/null 2>&1; then
  export APP_ROOT
  export BLOCKMINER_DOCKER_BUILD_NO_CACHE
  if [[ "$START_NGINX_PROXY" == "1" ]]; then
    log "NOTE: START_NGINX_PROXY is ignored; nginx is always part of the official 5-container stack."
  fi
  log "Docker: official stack only (db, redis, app, worker, nginx)"
  bash "$APP_ROOT/scripts/docker-ensure-block-miner-stack.sh"
else
  log "WARN: docker not found; skip container restart. Install deps / PM2 manually."
fi

health_port="${APP_HOST_PORT:-3000}"
if [[ -f "$APP_ROOT/.env.production" ]]; then
  line="$(grep -E '^[[:space:]]*APP_HOST_PORT=' "$APP_ROOT/.env.production" | tail -n1 || true)"
  if [[ -n "$line" ]]; then
    health_port="${line#*=}"
    health_port="${health_port//\"/}"
    health_port="${health_port//\'/}"
    health_port="$(echo "$health_port" | tr -d '[:space:]')"
  fi
fi

log "Health check (local, port $health_port)"
curl -sS -o /dev/null -w "health_http:%{http_code}\n" "http://127.0.0.1:${health_port}/health" || log "WARN: local health request failed"

log "Deploy script finished OK. Monitor logs: docker compose logs -f --tail=100 app"
