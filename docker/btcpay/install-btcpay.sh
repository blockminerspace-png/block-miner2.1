#!/usr/bin/env bash
# Official BTCPay Server (Docker) installer for BlockMiner operators.
# Wraps https://github.com/btcpayserver/btcpayserver-docker — same contract as upstream:
#   . ./btcpay-setup.sh -i
#
# Docs: https://docs.btcpayserver.org/Docker/
# Run on Linux as root after DNS for BTCPAY_HOST points to this machine and 80/443 are free.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/env"
ENV_EXAMPLE="${SCRIPT_DIR}/env.example"
REPO_URL="${BTCPAYGIT_REPO_URL:-https://github.com/btcpayserver/btcpayserver-docker.git}"
BRANCH="${BTCPAYGIT_BRANCH:-master}"
INSTALL_DIR="${BTCPAY_INSTALL_DIR:-"${SCRIPT_DIR}/btcpayserver-docker"}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage (Linux, as root):
  cd /path/to/block-miner
  cp docker/btcpay/env.example docker/btcpay/env   # or omit — this script creates env from example if missing
  nano docker/btcpay/env   # REQUIRED: real LETSENCRYPT_EMAIL; check BTCPAY_HOST matches public DNS
  sudo bash docker/btcpay/install-btcpay.sh

If BTCPay was installed before and you changed BTCPAY_HOST or Lightning:
  sudo bash docker/btcpay/reinstall-btcpay.sh

After install: https://$BTCPAY_HOST → create admin → Store → Greenfield API key + webhook for BlockMiner.
Upstream troubleshooting: https://docs.btcpayserver.org/Docker/
EOF
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (upstream contract): sudo bash $0"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    echo "Missing ${ENV_EXAMPLE}"
    exit 1
  fi
  echo "==> Creating ${ENV_FILE} from env.example (edit LETSENCRYPT_EMAIL before next run if still placeholder)."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=docker/btcpay/env
source "$ENV_FILE"
set +a

: "${BTCPAY_HOST:?Set BTCPAY_HOST in docker/btcpay/env}"
: "${LETSENCRYPT_EMAIL:?Set LETSENCRYPT_EMAIL in docker/btcpay/env}"

if [[ "$BTCPAY_HOST" == *"example.com"* || "$BTCPAY_HOST" == *"EXAMPLE"* ]]; then
  echo "Refusing: BTCPAY_HOST still looks like a placeholder (${BTCPAY_HOST}). Set your real hostname in docker/btcpay/env"
  exit 1
fi

if [[ "$LETSENCRYPT_EMAIL" == *"@example.com"* || "$LETSENCRYPT_EMAIL" == "you@example.com" ]]; then
  echo "Refusing: LETSENCRYPT_EMAIL is still a placeholder (${LETSENCRYPT_EMAIL})."
  echo "Edit docker/btcpay/env with a real mailbox (Let's Encrypt expiry notices)."
  exit 1
fi

export BTCPAY_HOST
export LETSENCRYPT_EMAIL
export NBITCOIN_NETWORK="${NBITCOIN_NETWORK:-mainnet}"
export BTCPAYGEN_CRYPTO1="${BTCPAYGEN_CRYPTO1:-btc}"
export BTCPAYGEN_REVERSEPROXY="${BTCPAYGEN_REVERSEPROXY:-nginx}"
# Single `-`: default clightning only if unset; empty string in env = on-chain only (upstream).
export BTCPAYGEN_LIGHTNING="${BTCPAYGEN_LIGHTNING-clightning}"
export BTCPAYGEN_ADDITIONAL_FRAGMENTS="${BTCPAYGEN_ADDITIONAL_FRAGMENTS:-opt-save-storage-s}"
export BTCPAY_ENABLE_SSH="${BTCPAY_ENABLE_SSH:-false}"

# Optional overrides from env file (same names as upstream README).
# Upstream btcpay-setup.sh runs with nounset and dereferences BTCPAY_ADDITIONAL_HOSTS — export even when empty.
export BTCPAY_ADDITIONAL_HOSTS="${BTCPAY_ADDITIONAL_HOSTS:-}"
[[ -n "${REVERSEPROXY_HTTP_PORT:-}" ]] && export REVERSEPROXY_HTTP_PORT
[[ -n "${REVERSEPROXY_HTTPS_PORT:-}" ]] && export REVERSEPROXY_HTTPS_PORT
[[ -n "${REVERSEPROXY_DEFAULT_HOST:-}" ]] && export REVERSEPROXY_DEFAULT_HOST
[[ -n "${ACME_CA_URI:-}" ]] && export ACME_CA_URI
[[ -n "${LIGHTNING_ALIAS:-}" ]] && export LIGHTNING_ALIAS
[[ -n "${BTCPAY_PROTOCOL:-}" ]] && export BTCPAY_PROTOCOL

echo "==> BTCPay install configuration (exported to btcpay-setup.sh):"
echo "    BTCPAY_HOST=${BTCPAY_HOST}"
echo "    NBITCOIN_NETWORK=${NBITCOIN_NETWORK}"
echo "    BTCPAYGEN_CRYPTO1=${BTCPAYGEN_CRYPTO1}"
echo "    BTCPAYGEN_REVERSEPROXY=${BTCPAYGEN_REVERSEPROXY}"
echo "    BTCPAYGEN_LIGHTNING=${BTCPAYGEN_LIGHTNING:-<empty>}"
echo "    BTCPAYGEN_ADDITIONAL_FRAGMENTS=${BTCPAYGEN_ADDITIONAL_FRAGMENTS}"
echo "    LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}"
echo ""
echo "==> DNS check (must show this server's public IP before Let's Encrypt works):"
if command -v getent >/dev/null 2>&1; then
  getent ahosts "$BTCPAY_HOST" | head -n 3 || true
elif command -v host >/dev/null 2>&1; then
  host "$BTCPAY_HOST" || true
else
  echo "    (install bind-tools or glibc getent for DNS check)"
fi

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  echo "==> Cloning btcpayserver-docker into ${INSTALL_DIR} ..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
else
  echo "==> Updating existing clone at ${INSTALL_DIR} ..."
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" || true
  git -C "$INSTALL_DIR" checkout "$BRANCH" 2>/dev/null || true
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" || true
fi

cd "$INSTALL_DIR"
if [[ ! -f ./btcpay-setup.sh ]]; then
  echo "btcpay-setup.sh not found inside ${INSTALL_DIR} (clone failed?)."
  exit 1
fi

echo ""
echo "==> Starting official: . ./btcpay-setup.sh -i"
echo "    This installs Docker if needed, generates compose, and starts BTCPay (sync takes a long time)."
echo ""

# Must be sourced (upstream contract)
# shellcheck disable=SC1091
. ./btcpay-setup.sh -i

echo ""
echo "==> Done."
echo "    Open: https://${BTCPAY_HOST}"
echo "    BlockMiner API .env: BTCPAY_URL=https://${BTCPAY_HOST} (no trailing slash) + Greenfield key, store id, webhook secret."
echo "    Re-run after env changes: sudo bash docker/btcpay/reinstall-btcpay.sh"
echo "    Upstream scripts in clone: btcpay-up.sh, btcpay-down.sh, btcpay-update.sh, changedomain.sh"
