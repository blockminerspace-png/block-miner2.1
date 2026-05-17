#!/usr/bin/env bash
# Gera um .zip só com ficheiros versionados em HEAD (equivalente a `git archive`).
# Não inclui .env / .env.production — evita sobrescrever segredos na VM ao usar com manual_deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -d .git ]]; then
  echo "Erro: precisa de ser a raiz do repositório Git." >&2
  exit 2
fi
OUT="${1:-$ROOT/blockminer-deploy-$(date +%Y%m%d-%H%M).zip}"
git archive --format=zip -o "$OUT" HEAD
echo "ZIP criado (só ficheiros em HEAD, sem .env): $OUT"
ls -lh "$OUT"
