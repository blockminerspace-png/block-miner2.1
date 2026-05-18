#!/usr/bin/env bash
# Garante que só a stack BlockMiner oficial (5 containers com nomes fixos) está em execução.
# Usado por vm-deploy-local-over-ssh.py, deploy-production-safe.sh e deploy manual na VM.
#
# Uso:
#   APP_ROOT=/root/blockminer/BlockMiner\ 2.1 ./scripts/docker-ensure-block-miner-stack.sh
#   BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 ... build app worker antes do up
#
set -euo pipefail

APP_ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BLOCKMINER_DOCKER_BUILD_NO_CACHE="${BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_STRAY_CLEANUP="${SKIP_STRAY_CLEANUP:-0}"

readonly -a BLOCK_MINER_SERVICES=(db redis app worker nginx)
readonly -a BLOCK_MINER_CONTAINER_NAMES=(
  block-miner-db
  block-miner-redis
  block-miner-app
  block-miner-worker
  block-miner-nginx
)

log() { echo "[block-miner-docker] $*"; }

compose_cmd() {
  local -a c=(docker compose -f "$APP_ROOT/docker-compose.yml")
  if [[ -f "$APP_ROOT/.env.production" ]]; then
    c+=(--env-file "$APP_ROOT/.env.production")
  fi
  printf '%s\n' "${c[@]}"
}

remove_stray_containers() {
  if [[ "$SKIP_STRAY_CLEANUP" == "1" ]]; then
    return 0
  fi

  if [[ -d /root/support-block-miner ]]; then
    (cd /root/support-block-miner && docker compose down --remove-orphans) 2>/dev/null || true
  fi

  local filter name old
  for filter in btcpay btc generated_btcpay support-block-miner; do
    mapfile -t names < <(docker ps -aq --filter "name=${filter}" 2>/dev/null || true)
    for name in "${names[@]:-}"; do
      [[ -n "$name" ]] || continue
      log "removing stray container: $name"
      docker rm -f "$name" 2>/dev/null || true
    done
  done

  for old in block-miner-app-1 block-miner-worker-1 block-miner-nginx-1 block-miner-db-1 block-miner-redis-1; do
    if docker ps -a --format '{{.Names}}' | grep -qx "$old"; then
      log "removing legacy replica name: $old"
      docker rm -f "$old" 2>/dev/null || true
    fi
  done

  docker network rm support-block-miner_default 2>/dev/null || true
  docker network rm block-miner_blockminer_net 2>/dev/null || true
}

verify_running_containers() {
  local -a running=()
  mapfile -t running < <(docker ps --format '{{.Names}}' | grep '^block-miner-' || true)

  local name
  for name in "${running[@]:-}"; do
    local ok=0
    local allowed
    for allowed in "${BLOCK_MINER_CONTAINER_NAMES[@]}"; do
      if [[ "$name" == "$allowed" ]]; then
        ok=1
        break
      fi
    done
    if [[ "$ok" -ne 1 ]]; then
      log "ERROR: unexpected running container: $name (not in official stack)"
      return 1
    fi
  done

  local expected
  for expected in "${BLOCK_MINER_CONTAINER_NAMES[@]}"; do
    if ! docker ps --format '{{.Names}}' | grep -qx "$expected"; then
      log "ERROR: expected container not running: $expected"
      return 1
    fi
  done

  local count="${#running[@]}"
  if [[ "$count" -ne 5 ]]; then
    log "ERROR: expected 5 block-miner-* containers, found ${count:-0}"
    docker ps --format 'table {{.Names}}\t{{.Status}}' | grep block-miner || true
    return 1
  fi

  log "OK: exactly 5 official containers running"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E '^(NAMES|block-miner-)' || true
  return 0
}

main() {
  if [[ ! -f "$APP_ROOT/docker-compose.yml" ]]; then
    log "ERROR: missing $APP_ROOT/docker-compose.yml"
    exit 1
  fi

  cd "$APP_ROOT"
  mapfile -t compose < <(compose_cmd)

  remove_stray_containers

  if [[ "$SKIP_BUILD" != "1" ]]; then
    if [[ "$BLOCKMINER_DOCKER_BUILD_NO_CACHE" == "1" ]]; then
      log "building app worker (--no-cache)"
      "${compose[@]}" build --no-cache app worker
    else
      log "building app worker"
      "${compose[@]}" build app worker
    fi
  fi

  log "starting services: ${BLOCK_MINER_SERVICES[*]}"
  "${compose[@]}" up -d --remove-orphans "${BLOCK_MINER_SERVICES[@]}"

  if ! ss -tlnp 2>/dev/null | grep -qF ':80 '; then
    log "host :80 not bound; force-recreating nginx"
    "${compose[@]}" up -d --force-recreate --no-deps nginx || true
  fi

  "${compose[@]}" exec -T app npx prisma migrate deploy --schema=server/prisma/schema.prisma || true

  verify_running_containers
}

main "$@"
