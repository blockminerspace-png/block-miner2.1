#!/usr/bin/env bash
# Run on the Linux VPS as root. Stops the official BTCPay Server docker stack (frees CPU/RAM/disk I/O).
# Default install path matches docker/btcpay/install-btcpay.sh (BTCPAY_INSTALL_DIR or repo-relative clone).
set -euo pipefail

REPO_ROOT="${1:-/root/block-miner}"
BT_INST="${BTCPAY_INSTALL_DIR:-${REPO_ROOT}/docker/btcpay/btcpayserver-docker}"

if [[ -d "$BT_INST" ]] && [[ -f "$BT_INST/docker-compose.yml" || -f "$BT_INST/compose.yml" ]]; then
  cd "$BT_INST"
  if [[ -f docker-compose.yml ]]; then
    docker compose -f docker-compose.yml down --remove-orphans || true
  else
    docker compose down --remove-orphans || true
  fi
  echo "OK: BTCPay docker stack stopped in $BT_INST"
else
  echo "SKIP: no compose file under $BT_INST (clone missing or already removed)."
fi
