#!/usr/bin/env bash
# Safe production deploy wrapper — used by GitHub Actions and `npm run deploy`.
# Delegates to the canonical local→VM flow when credentials exist,
# otherwise documents the required manual step.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/scripts/vm_config_secret.py" ]] || [[ -n "${VM_IP:-}" && -n "${VM_PASSWORD:-}" ]]; then
  echo "[deploy] using scripts/vm-deploy-local-over-ssh.py"
  exec python3 "$ROOT/scripts/vm-deploy-local-over-ssh.py" "$@"
fi

if [[ -n "${APP_ROOT:-}" ]] && [[ -d "${APP_ROOT}/.git" ]]; then
  echo "[deploy] VPS git pull + docker compose (APP_ROOT=$APP_ROOT)"
  cd "$APP_ROOT"
  git fetch origin "${GIT_BRANCH:-main}"
  git reset --hard "origin/${GIT_BRANCH:-main}"
  docker compose build app worker
  docker compose up -d --remove-orphans db redis app worker telegram-worker nginx
  bash "$APP_ROOT/scripts/vm-prod-maintenance.sh" || true
  exit 0
fi

echo "No deploy credentials found." >&2
echo "  Option A: create scripts/vm_config_secret.py and run python3 scripts/vm-deploy-local-over-ssh.py" >&2
echo "  Option B: set APP_ROOT to the VPS checkout and run from SSH session" >&2
exit 1
