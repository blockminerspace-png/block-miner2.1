#!/usr/bin/env bash
# Run on the BlockMiner VPS (repo root). Issues Let's Encrypt for the BTCPay public hostname
# and installs PEMs into nginx/certs-btcpay/ so browsers trust https://<hostname>/ (no self-signed).
# Prerequisites: DNS A/AAAA for DOMAIN → this host; port 80 reachable; nginx stack up (serves /.well-known from certbot-www).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

DOMAIN="${BTCPAY_LE_DOMAIN:-btcpay.blockminer.space}"
EMAIL="${BTCPAY_LE_EMAIL:-}"
if [[ -z "${EMAIL}" ]] && [[ -f docker/btcpay/env ]]; then
  EMAIL="$(grep -E '^LETSENCRYPT_EMAIL=' docker/btcpay/env 2>/dev/null | cut -d= -f2- | tr -d '\r' | head -1 || true)"
fi
if [[ -z "${EMAIL}" ]]; then
  echo "ERROR: set BTCPAY_LE_EMAIL or LETSENCRYPT_EMAIL in docker/btcpay/env" >&2
  exit 1
fi

CERT_NAME="${BTCPAY_LE_CERT_NAME:-btcpay-blockminer-edge}"
mkdir -p certbot-www/.well-known/acme-challenge

run_certbot() {
  local -a args=(
    certonly
    --webroot
    -w "${REPO_ROOT}/certbot-www"
    -d "${DOMAIN}"
    --cert-name "${CERT_NAME}"
    --email "${EMAIL}"
    --agree-tos
    --non-interactive
    --keep-until-expiring
  )
  if command -v certbot >/dev/null 2>&1; then
    certbot "${args[@]}"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "${REPO_ROOT}/certbot-www:/var/www/certbot" \
      -v /etc/letsencrypt:/etc/letsencrypt \
      -v /var/lib/letsencrypt:/var/lib/letsencrypt \
      certbot/certbot:latest "${args[@]}"
    return
  fi
  echo "ERROR: install certbot (apt install certbot) or install Docker for certbot/certbot image" >&2
  exit 1
}

echo "==> Requesting Let's Encrypt certificate for ${DOMAIN} (email: ${EMAIL})"
run_certbot

LE_DIR="/etc/letsencrypt/live/${CERT_NAME}"
if [[ ! -f "${LE_DIR}/fullchain.pem" ]] || [[ ! -f "${LE_DIR}/privkey.pem" ]]; then
  echo "ERROR: expected ${LE_DIR}/fullchain.pem and privkey.pem after certbot" >&2
  exit 1
fi

mkdir -p nginx/certs-btcpay
cp "${LE_DIR}/fullchain.pem" nginx/certs-btcpay/cert.pem
cp "${LE_DIR}/privkey.pem" nginx/certs-btcpay/key.pem
chmod 644 nginx/certs-btcpay/cert.pem
chmod 600 nginx/certs-btcpay/key.pem
echo "==> Installed PEMs into nginx/certs-btcpay/ (from ${CERT_NAME})"

export COMPOSE_PROFILES=proxy
if [[ -f .env.production ]]; then
  docker compose --env-file .env.production up -d nginx
  docker compose --env-file .env.production exec -T nginx nginx -s reload
  echo "==> nginx reload OK"
else
  echo "WARNING: no .env.production — reload nginx manually: COMPOSE_PROFILES=proxy docker compose --env-file .env.production exec nginx nginx -s reload" >&2
fi
