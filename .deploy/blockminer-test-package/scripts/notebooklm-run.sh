#!/usr/bin/env bash
# BlockMiner wrapper: run notebooklm-py CLI with a repo-local --target install (gitignored).
# First run bootstraps vendor-notebooklm/ via pip. Agent and humans use this path so
# `notebooklm` does not need a global venv.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor-notebooklm"
export PYTHONPATH="$VENDOR${PYTHONPATH:+:$PYTHONPATH}"

if [[ ! -x "$VENDOR/bin/notebooklm" ]]; then
  echo "notebooklm-run: bootstrapping notebooklm-py into $VENDOR (one-time)…" >&2
  mkdir -p "$VENDOR"
  python3 -m pip install --target "$VENDOR" "notebooklm-py>=0.3.4" >&2
fi

exec "$VENDOR/bin/notebooklm" "$@"
