#!/usr/bin/env bash
# Official BTCPay Server (Docker) installer wrapper for BlockMiner operators.
# Run on Linux as root after DNS for BTCPAY_HOST points to this machine.
# Docs: https://docs.btcpayserver.org/Docker/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/env"
REPO_URL="${BTCPAYGIT_REPO_URL:-https://github.com/btcpayserver/btcpayserver-docker.git}"
BRANCH="${BTCPAYGIT_BRANCH:-master}"
INSTALL_DIR="${BTCPAY_INSTALL_DIR:-"${SCRIPT_DIR}/btcpayserver-docker"}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage (Linux, as root):
  cd /path/to/block-miner
  cp docker/btcpay/env.example docker/btcpay/env
  nano docker/btcpay/env   # set BTCPAY_HOST, LETSENCRYPT_EMAIL, NBITCOIN_NETWORK, etc.
  sudo bash docker/btcpay/install-btcpay.sh

After install, open https://$BTCPAY_HOST in a browser, create the first admin account,
create a Store, then issue a Greenfield API key and webhook for BlockMiner.
EOF
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root so Docker/systemd integration matches upstream: sudo bash $0"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Copy docker/btcpay/env.example to docker/btcpay/env and edit BTCPAY_HOST + LETSENCRYPT_EMAIL."
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=docker/btcpay/env
source "$ENV_FILE"
set +a

: "${BTCPAY_HOST:?Set BTCPAY_HOST in docker/btcpay/env}"
: "${LETSENCRYPT_EMAIL:?Set LETSENCRYPT_EMAIL in docker/btcpay/env}"

export BTCPAY_HOST
export LETSENCRYPT_EMAIL
export NBITCOIN_NETWORK="${NBITCOIN_NETWORK:-testnet}"
export BTCPAYGEN_CRYPTO1="${BTCPAYGEN_CRYPTO1:-btc}"
export BTCPAYGEN_REVERSEPROXY="${BTCPAYGEN_REVERSEPROXY:-nginx}"
export BTCPAYGEN_LIGHTNING="${BTCPAYGEN_LIGHTNING:-}"
export BTCPAYGEN_ADDITIONAL_FRAGMENTS="${BTCPAYGEN_ADDITIONAL_FRAGMENTS:-opt-save-storage-s}"
export BTCPAY_ENABLE_SSH="${BTCPAY_ENABLE_SSH:-false}"

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  echo "Cloning btcpayserver-docker into ${INSTALL_DIR} ..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
else
  echo "Updating existing clone at ${INSTALL_DIR} ..."
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" || true
  git -C "$INSTALL_DIR" checkout "$BRANCH" 2>/dev/null || true
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" || true
fi

cd "$INSTALL_DIR"
if [[ ! -f ./btcpay-setup.sh ]]; then
  echo "btcpay-setup.sh not found inside ${INSTALL_DIR} (clone failed?)."
  exit 1
fi

echo "Starting official btcpay-setup.sh -i (this can take a long time: images + blockchain sync) ..."
# Must be sourced (upstream contract)
# shellcheck disable=SC1091
. ./btcpay-setup.sh -i

echo "Done. Open https://${BTCPAY_HOST} — then configure BlockMiner BTCPAY_* env to use this base URL."
