#!/usr/bin/env bash
# Ask the BlockMiner @opencoder agent (OpenCode) from a real terminal — same cwd as repo root.
# Usage (from repo root):
#   bash scripts/opencoder-ask.sh "your question in natural language"
# Requires: ~/.opencode/bin/opencode (official install).
# Auth: set OPENROUTER_API_KEY in this directory's .env (see .env.example) or export it; opencode.json uses OpenRouter.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPENCODE_BIN="${OPENCODE_BIN:-$HOME/.opencode/bin/opencode}"
if [[ ! -x "$OPENCODE_BIN" ]]; then
  echo "OpenCode not found at $OPENCODE_BIN — install from https://opencode.ai or set OPENCODE_BIN." >&2
  exit 127
fi
if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/opencoder-ask.sh \"prompt for @opencoder\"" >&2
  exit 2
fi
cd "$ROOT"
exec "$OPENCODE_BIN" run --agent opencoder "$*"
