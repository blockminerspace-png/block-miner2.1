#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${VM_APP_ROOT:-/root/blockminer/BlockMiner 2.1}"

if [ -d /root/support-block-miner ]; then
  (cd /root/support-block-miner && docker compose down --remove-orphans) 2>/dev/null || true
fi

docker ps -aq --filter 'name=btcpay' | xargs -r docker rm -f
docker ps -aq --filter 'name=btc' | xargs -r docker rm -f
docker ps -aq --filter 'name=generated_btcpay' | xargs -r docker rm -f
docker ps -aq --filter 'name=support' | xargs -r docker rm -f

cd "$APP_ROOT"

docker compose --env-file .env.production down --remove-orphans 2>/dev/null || true

for old in block-miner-app-1 block-miner-worker-1 block-miner-nginx-1 block-miner-db-1 block-miner-redis-1; do
  docker rm -f "$old" 2>/dev/null || true
done

docker network rm support-block-miner_default 2>/dev/null || true
docker network rm block-miner_blockminer_net 2>/dev/null || true

docker compose --env-file .env.production up -d --force-recreate

echo '--- running containers ---'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
