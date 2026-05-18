#!/usr/bin/env bash
# Wrapper legado — delega para o script oficial de stack.
set -euo pipefail
APP_ROOT="${VM_APP_ROOT:-/root/blockminer/BlockMiner 2.1}"
export APP_ROOT
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/docker-ensure-block-miner-stack.sh"
