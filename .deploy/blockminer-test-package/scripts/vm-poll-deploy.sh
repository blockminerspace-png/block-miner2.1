#!/usr/bin/env bash
#
# Run on the VPS (cron or systemd timer). When origin/main is ahead of HEAD,
# runs scripts/deploy-production-safe.sh (git pull ff-only + docker compose).
#
# Environment:
#   APP_ROOT      — git clone path (default: /root/block-miner)
#   GIT_BRANCH    — tracked branch (default: main)
#   GIT_REMOTE    — remote name (default: origin)
#
# Install (systemd): copy scripts/systemd/*.service and *.timer to /etc/systemd/system/,
# adjust paths, then: systemctl enable --now blockminer-git-deploy.timer
#
set -euo pipefail

APP_ROOT="${APP_ROOT:-/root/block-miner}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
DEPLOY_SCRIPT="$APP_ROOT/scripts/deploy-production-safe.sh"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] vm-poll-deploy: $*"; }

if [[ ! -d "$APP_ROOT/.git" ]]; then
  log "ERROR: not a git repo: $APP_ROOT"
  exit 1
fi

if [[ ! -f "$DEPLOY_SCRIPT" ]]; then
  log "ERROR: missing $DEPLOY_SCRIPT"
  exit 1
fi

cd "$APP_ROOT"

git fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet || {
  log "ERROR: git fetch failed"
  exit 1
}

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "FETCH_HEAD")"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "up to date ($LOCAL)"
  exit 0
fi

log "deploying: $LOCAL -> $REMOTE"
export APP_ROOT GIT_BRANCH
# shellcheck disable=SC1090
bash "$DEPLOY_SCRIPT"
log "done"
