#!/usr/bin/env bash
# Instala/atualiza cron de limpeza automática na VM (idempotente).
# - Diário 04:30 UTC: assets legados (rápido, sem parar builds)
# - Domingo 04:00 UTC: limpeza completa (+ Docker images/cache)
#
# Uso: bash scripts/install-vm-maintenance-cron.sh [/root/block-miner-v3]

set -euo pipefail

APP_ROOT="${1:-/root/block-miner-v3}"
MAINT="$APP_ROOT/scripts/vm-prod-maintenance.sh"
LOG="/var/log/bm-maintenance.log"

if [[ ! -x "$MAINT" ]] && [[ ! -f "$MAINT" ]]; then
  echo "[cron] skip — missing $MAINT"
  exit 0
fi

chmod +x "$MAINT" 2>/dev/null || true

TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v 'vm-prod-maintenance.sh' >"$TMP" || true
{
  cat "$TMP"
  echo "30 4 * * * APP_ROOT=$APP_ROOT BM_MAINTENANCE_MODE=light bash $MAINT >> $LOG 2>&1"
  echo "0 4 * * 0 APP_ROOT=$APP_ROOT BM_MAINTENANCE_MODE=full bash $MAINT >> $LOG 2>&1"
} | crontab -
rm -f "$TMP"

echo "[cron] installed:"
crontab -l | grep vm-prod-maintenance || true
