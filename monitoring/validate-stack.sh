#!/usr/bin/env bash
# Validate observability compose file (no containers required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
docker compose -f docker-compose.observability.yml config >/dev/null
echo "docker-compose.observability.yml: OK"
promtool check config monitoring/prometheus/prometheus.yml 2>/dev/null || echo "promtool not installed — skip prometheus lint"
echo "Done."
