#!/usr/bin/env bash
# Post-deploy / scheduled prod cleanup — safe for BlockMiner VM.
# - Prunes stale Vite entry bundles (index-*.js) inside the running app container
# - Trims merged lazy chunks older than LEGACY_ASSET_MAX_DAYS
# - Resets host .legacy-assets bloat (one generation only on next deploy)
# - Prunes unused Docker images and build cache (never touches volumes / db)
#
# Usage on VM:
#   APP_ROOT=/root/block-miner-v3 bash scripts/vm-prod-maintenance.sh
# Or via: python3 scripts/vm-prod-cleanup-over-ssh.py

set -euo pipefail

APP_ROOT="${APP_ROOT:-/root/block-miner-v3}"
LEGACY_ASSETS_DIR="${LEGACY_ASSETS_DIR:-$APP_ROOT/.legacy-assets}"
LEGACY_ASSET_MAX_DAYS="${LEGACY_ASSET_MAX_DAYS:-3}"
DOCKER_IMAGE_UNTIL_HOURS="${DOCKER_IMAGE_UNTIL_HOURS:-72}"
DOCKER_BUILDER_UNTIL_HOURS="${DOCKER_BUILDER_UNTIL_HOURS:-72}"
LEGACY_HOST_MAX_MB="${LEGACY_HOST_MAX_MB:-80}"

echo "[maintenance] APP_ROOT=$APP_ROOT"

compose() {
  local -a c=(docker compose -f "$APP_ROOT/docker-compose.yml")
  if [[ -f "$APP_ROOT/.env.production" ]]; then
    c+=(--env-file "$APP_ROOT/.env.production")
  fi
  "${c[@]}" "$@"
}

prune_container_assets() {
  if ! docker ps --format '{{.Names}}' | grep -qx block-miner-app; then
    echo "[maintenance] block-miner-app not running — skip asset prune"
    return 0
  fi

  docker exec block-miner-app sh -eu -c '
    ASSETS=/app/client/dist/assets
    INDEX=/app/client/dist/index.html
    [ -d "$ASSETS" ] && [ -f "$INDEX" ] || exit 0
    CURRENT=$(grep -oE "index-[^\"]+\.js" "$INDEX" | head -1)
    BEFORE_JS=$(find "$ASSETS" -maxdepth 1 -name "index-*.js" 2>/dev/null | wc -l)
    KEEP_FILE=$(mktemp)
    if [ -n "$CURRENT" ]; then
      echo "$CURRENT" >> "$KEEP_FILE"
      if [ -f "$ASSETS/$CURRENT" ]; then
        grep -oE "index-[A-Za-z0-9_-]+\.js" "$ASSETS/$CURRENT" >> "$KEEP_FILE" || true
      fi
      sort -u "$KEEP_FILE" -o "$KEEP_FILE"
      for f in "$ASSETS"/index-*.js; do
        [ -e "$f" ] || continue
        base=$(basename "$f")
        if grep -qxF "$base" "$KEEP_FILE"; then
          continue
        fi
        # Only drop unreferenced entry-sized stale bundles (lazy route chunks stay).
        size=$(wc -c < "$f" | tr -d " ")
        if [ "$size" -gt 500000 ] && [ "$(find "$f" -mtime +'"$LEGACY_ASSET_MAX_DAYS"' -print 2>/dev/null | wc -l)" -gt 0 ]; then
          rm -f "$f"
        fi
      done
    fi
    rm -f "$KEEP_FILE"
    find "$ASSETS" -maxdepth 1 -type f -mtime +'"$LEGACY_ASSET_MAX_DAYS"' \( -name "*.js" -o -name "*.css" \) ! -name "index-*.js" -delete 2>/dev/null || true
    AFTER_JS=$(find "$ASSETS" -maxdepth 1 -name "index-*.js" 2>/dev/null | wc -l)
    du -sh "$ASSETS" 2>/dev/null || true
    echo "[maintenance] container index-*.js: ${BEFORE_JS} -> ${AFTER_JS} (entry ${CURRENT:-?})"
  '
}

prune_host_legacy_assets() {
  if [[ ! -d "$LEGACY_ASSETS_DIR" ]]; then
    echo "[maintenance] no legacy assets dir"
    return 0
  fi
  local before after
  before=$(du -sm "$LEGACY_ASSETS_DIR" 2>/dev/null | awk '{print $1}' || echo "0")
  find "$LEGACY_ASSETS_DIR" -maxdepth 1 -type f -name 'index-*.js' -delete 2>/dev/null || true
  find "$LEGACY_ASSETS_DIR" -type f -mtime +"$LEGACY_ASSET_MAX_DAYS" -delete 2>/dev/null || true
  after=$(du -sm "$LEGACY_ASSETS_DIR" 2>/dev/null | awk '{print $1}' || echo "0")
  if [[ "$after" -gt "$LEGACY_HOST_MAX_MB" ]]; then
    echo "[maintenance] legacy dir ${after}MB > cap ${LEGACY_HOST_MAX_MB}MB — wiping"
    find "$LEGACY_ASSETS_DIR" -mindepth 1 -delete 2>/dev/null || true
    after=$(du -sm "$LEGACY_ASSETS_DIR" 2>/dev/null | awk '{print $1}' || echo "0")
  fi
  echo "[maintenance] host legacy assets: ${before}MB -> ${after}MB"
}

prune_docker_artifacts() {
  echo "[maintenance] docker image prune (dangling)…"
  docker image prune -f 2>/dev/null || true
  echo "[maintenance] docker image prune unused older than ${DOCKER_IMAGE_UNTIL_HOURS}h…"
  docker image prune -af --filter "until=${DOCKER_IMAGE_UNTIL_HOURS}h" 2>/dev/null || true
  echo "[maintenance] docker builder prune older than ${DOCKER_BUILDER_UNTIL_HOURS}h…"
  docker builder prune -af --filter "until=${DOCKER_BUILDER_UNTIL_HOURS}h" 2>/dev/null || true
  # Frequent deploys keep cache "fresh" — if still huge, drop all unused layers (safe; next build is slower once).
  BUILDER_RECLAIM_MB=$(docker system df -v 2>/dev/null | awk '/Build Cache/ {gsub(/[^0-9.]/,"",$4); print int($4+0.5)}' | head -1)
  if [[ -n "${BUILDER_RECLAIM_MB:-}" ]] && [[ "$BUILDER_RECLAIM_MB" -gt 20480 ]]; then
    echo "[maintenance] build cache ~${BUILDER_RECLAIM_MB}MB reclaimable — full builder prune"
    docker builder prune -af 2>/dev/null || true
  fi
  docker system df 2>/dev/null || true
}

prune_container_assets
prune_host_legacy_assets

MODE="${BM_MAINTENANCE_MODE:-full}"
if [[ "$MODE" == "full" ]]; then
  prune_docker_artifacts
else
  echo "[maintenance] mode=$MODE — skip docker prune"
fi

curl -sS -o /dev/null -w "[maintenance] health:%{http_code}\n" http://127.0.0.1:3000/health || true
echo "[maintenance] done"
