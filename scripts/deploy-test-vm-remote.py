#!/usr/bin/env python3
"""
SSH deploy to the BlockMiner test VPS (see .cursor/rules/blockminer-test-vm.mdc).

Reads credentials from scripts/vm_config_secret.py (gitignored) or env VM_IP / VM_USER / VM_PASSWORD.
Streams remote output until the remote bash session ends (long docker builds supported).

Env:
  BLOCKMINER_DOCKER_BUILD_NO_CACHE=1  — remote `deploy-production-safe.sh` runs `docker compose build --no-cache app`
  DEPLOY_TEST_VM_TIMEOUT_SEC          — max wait seconds (default 7200)
"""
from __future__ import annotations

import importlib.util
import os
import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError as e:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    raise SystemExit(1) from e

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SECRET = SCRIPT_DIR / "vm_config_secret.py"


def _docker_no_cache_enabled() -> bool:
    v = os.environ.get("BLOCKMINER_DOCKER_BUILD_NO_CACHE", "").strip().lower()
    return v in ("1", "true", "yes", "y", "on")


def build_remote_script() -> str:
    prefix = "export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1\n" if _docker_no_cache_enabled() else ""
    return prefix + r"""set -euo pipefail
APP_ROOT=/root/block-miner-v3
REPO=https://github.com/blockminerspace-png/block-miner-v3.git
BRANCH=main
mkdir -p "$(dirname "$APP_ROOT")"
if [ ! -d "$APP_ROOT/.git" ]; then
  git clone "$REPO" "$APP_ROOT"
fi
cd "$APP_ROOT"
git remote set-url origin "$REPO"
git fetch origin --prune
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  echo "[WARN] origin/$BRANCH missing; using main"
  git checkout main 2>/dev/null || git checkout -B main origin/main
  git reset --hard origin/main
  BRANCH=main
fi
export APP_ROOT GIT_BRANCH="$BRANCH" SKIP_APP_TARBALL=1 DEPLOY_GIT_MODE=reset START_NGINX_PROXY=1 APP_HOST_PORT=3001
bash scripts/deploy-production-safe.sh
"""


def load_secret() -> tuple[str, str, str]:
    if SECRET.exists():
        spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
        if spec is None or spec.loader is None:
            raise RuntimeError("Cannot load vm_config_secret.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        ip = str(getattr(mod, "IP", "") or "").strip()
        login = str(getattr(mod, "LOGIN", "root") or "root").strip()
        pw = str(getattr(mod, "ROOT_PASSWORD", "") or "").strip()
        if ip and login and pw:
            return ip, login, pw
    ip = (os.environ.get("VM_IP") or "").strip()
    login = (os.environ.get("VM_USER") or "root").strip()
    pw = (os.environ.get("VM_PASSWORD") or "").strip()
    if not (ip and pw):
        raise SystemExit(
            "Missing credentials: create scripts/vm_config_secret.py from vm_config_secret.example.py "
            "or set VM_IP and VM_PASSWORD."
        )
    return ip, login, pw


def main() -> int:
    host, user, password = load_secret()
    max_seconds = int(os.environ.get("DEPLOY_TEST_VM_TIMEOUT_SEC") or "7200")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username=user,
        password=password,
        timeout=60,
        look_for_keys=False,
        allow_agent=False,
    )
    # No PTY: avoids echoing the script into an interactive shell on some hosts.
    stdin, stdout, stderr = client.exec_command("bash -s", get_pty=False)
    stdin.write(build_remote_script())
    stdin.close()

    start = time.monotonic()
    ch = stdout.channel
    err_ch = stderr.channel

    try:
        while True:
            if ch.recv_ready():
                chunk = ch.recv(65536)
                if chunk:
                    os.write(1, chunk)
            if err_ch.recv_stderr_ready():
                chunk = err_ch.recv_stderr(65536)
                if chunk:
                    os.write(2, chunk)
            if ch.exit_status_ready():
                break
            if time.monotonic() - start > max_seconds:
                client.close()
                print("\n[deploy-test-vm-remote] TIMEOUT", file=sys.stderr)
                return 124
            time.sleep(0.2)
        code = ch.recv_exit_status()
        return int(code)
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
