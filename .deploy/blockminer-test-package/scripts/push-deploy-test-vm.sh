#!/usr/bin/env bash
# From repo root: push Git then deploy the test VPS (see vm_config_secret.py).
# Default: Docker image rebuild without cache (set BLOCKMINER_DOCKER_BUILD_NO_CACHE=0 to allow cache).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
REMOTE="${GIT_REMOTE:-origin}"
BRANCH="${GIT_BRANCH:-main}"

git push "$REMOTE" "$BRANCH"
export BLOCKMINER_DOCKER_BUILD_NO_CACHE="${BLOCKMINER_DOCKER_BUILD_NO_CACHE:-1}"
exec python3 scripts/deploy-test-vm-remote.py
