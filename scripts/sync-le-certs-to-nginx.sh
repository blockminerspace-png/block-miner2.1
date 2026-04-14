#!/usr/bin/env bash
# Copia fullchain/privkey do Let's Encrypt para nginx/certs (nomes esperados pelo nginx.conf)
# e recarrega o contentor nginx. Usar após certbot renew (deploy-hook) ou primeiro setup.
# Uso na VPS: DOMAIN=tests.blockminer.space PROJECT_ROOT=/root/block-miner ./scripts/sync-le-certs-to-nginx.sh
set -euo pipefail
DOMAIN="${DOMAIN:-tests.blockminer.space}"
PROJECT_ROOT="${PROJECT_ROOT:-/root/block-miner}"
LIVE="/etc/letsencrypt/live/${DOMAIN}"
if [[ ! -f "${LIVE}/fullchain.pem" ]] || [[ ! -f "${LIVE}/privkey.pem" ]]; then
  echo "Missing certs under ${LIVE}" >&2
  exit 1
fi
install -m 644 "${LIVE}/fullchain.pem" "${PROJECT_ROOT}/nginx/certs/cert.pem"
install -m 600 "${LIVE}/privkey.pem" "${PROJECT_ROOT}/nginx/certs/key.pem"
cd "${PROJECT_ROOT}"
docker compose exec -T nginx nginx -s reload
echo "Synced LE certs for ${DOMAIN} -> nginx/certs + reload"
