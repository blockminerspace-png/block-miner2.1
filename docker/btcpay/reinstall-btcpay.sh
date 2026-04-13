#!/usr/bin/env bash
# Re-apply BTCPay Docker configuration from docker/btcpay/env without recloning from scratch.
# Use after changing BTCPAY_HOST, BTCPAYGEN_LIGHTNING, fragments, or Let's Encrypt email.
# Same requirements as install-btcpay.sh: Linux, root, valid env file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/env"
INSTALL_DIR="${BTCPAY_INSTALL_DIR:-"${SCRIPT_DIR}/btcpayserver-docker"}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE} — copy env.example and edit."
  exit 1
fi

if [[ ! -d "${INSTALL_DIR}/.git" || ! -f "${INSTALL_DIR}/btcpay-setup.sh" ]]; then
  echo "No upstream clone at ${INSTALL_DIR}. Run install-btcpay.sh first."
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=docker/btcpay/env
source "$ENV_FILE"
set +a

: "${BTCPAY_HOST:?}"
: "${LETSENCRYPT_EMAIL:?}"

export BTCPAY_HOST LETSENCRYPT_EMAIL
export NBITCOIN_NETWORK="${NBITCOIN_NETWORK:-mainnet}"
export BTCPAYGEN_CRYPTO1="${BTCPAYGEN_CRYPTO1:-btc}"
export BTCPAYGEN_REVERSEPROXY="${BTCPAYGEN_REVERSEPROXY:-nginx}"
export BTCPAYGEN_LIGHTNING="${BTCPAYGEN_LIGHTNING-clightning}"
export BTCPAYGEN_ADDITIONAL_FRAGMENTS="${BTCPAYGEN_ADDITIONAL_FRAGMENTS:-opt-save-storage-s}"
export BTCPAY_ENABLE_SSH="${BTCPAY_ENABLE_SSH:-false}"
export BTCPAY_ADDITIONAL_HOSTS="${BTCPAY_ADDITIONAL_HOSTS:-}"
[[ -n "${REVERSEPROXY_HTTP_PORT:-}" ]] && export REVERSEPROXY_HTTP_PORT
[[ -n "${REVERSEPROXY_HTTPS_PORT:-}" ]] && export REVERSEPROXY_HTTPS_PORT
[[ -n "${REVERSEPROXY_DEFAULT_HOST:-}" ]] && export REVERSEPROXY_DEFAULT_HOST
[[ -n "${ACME_CA_URI:-}" ]] && export ACME_CA_URI
[[ -n "${LIGHTNING_ALIAS:-}" ]] && export LIGHTNING_ALIAS
[[ -n "${BTCPAY_PROTOCOL:-}" ]] && export BTCPAY_PROTOCOL

cd "$INSTALL_DIR"
echo "==> Re-running upstream btcpay-setup.sh -i from ${INSTALL_DIR}"
set +u
# shellcheck disable=SC1091
. ./btcpay-setup.sh -i
btcpay_setup_status=$?
set -euo pipefail
if [[ "$btcpay_setup_status" -ne 0 ]]; then
  exit "$btcpay_setup_status"
fi

echo "==> Reinstall pass complete. https://${BTCPAY_HOST}"
