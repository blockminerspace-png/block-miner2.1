#!/usr/bin/env python3
"""
Deploy BlockMiner test VPS **without git on the server** (no `git fetch` / GitHub).

Use when the repo is private and the VM has no PAT/SSH key, or when you want the
exact tree from **your local** `git HEAD` (committed files only).

From repo root:

  python3 scripts/vm-deploy-local-over-ssh.py

Credentials: same as `deploy-test-vm-remote.py` — `scripts/vm_config_secret.py`
(copy from `vm_config_secret.example.py`) or env `VM_IP`, `VM_USER`, `VM_PASSWORD`.

Optional env:
  VM_APP_ROOT=/root/block-miner-v3   — remote app directory (must exist)
  BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 — `docker compose build --no-cache phd app`
  SKIP_DOCKER=1                     — only upload + extract tracked files (no compose)

Requires: paramiko, local `git`, remote `docker` + same compose layout as production deploy.
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
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


def _skip_docker() -> bool:
    return os.environ.get("SKIP_DOCKER", "").strip().lower() in ("1", "true", "yes", "y", "on")


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
            "or set VM_IP and VM_PASSWORD (and optionally VM_USER)."
        )
    return ip, login, pw


def _make_gzipped_archive() -> Path:
    """Tracked files only at HEAD (same as `git archive`), compressed (shell pipe avoids pipe deadlocks)."""
    tmp = Path(tempfile.mkdtemp(prefix="bm-deploy-"))
    out = tmp / "tree.tgz"
    # One shell pipeline: reader drains gzip stdout while git archive feeds gzip stdin.
    r = subprocess.run(
        [
            "bash",
            "-lc",
            f'set -euo pipefail; git archive --format=tar HEAD | gzip -1 > "{out}"',
        ],
        cwd=str(REPO_ROOT),
        check=False,
    )
    if r.returncode != 0:
        raise SystemExit(f"git archive | gzip failed (exit {r.returncode})")
    if not out.is_file() or out.stat().st_size == 0:
        raise SystemExit("archive output missing or empty")
    print(f"[local] archive {out.stat().st_size} bytes -> {out}", flush=True)
    return out


def _remote_script(app_root: str) -> str:
    no_cache = "export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1\n" if _docker_no_cache_enabled() else ""
    if _skip_docker():
        return f"""set -euo pipefail
{no_cache}APP_ROOT={app_root}
cd "$APP_ROOT"
tar xzf /tmp/blockminer_local_deploy.tgz
rm -f /tmp/blockminer_local_deploy.tgz
echo "[vm] extract OK (SKIP_DOCKER=1)"
"""
    return f"""set -euo pipefail
{no_cache}APP_ROOT={app_root}
cd "$APP_ROOT"
tar xzf /tmp/blockminer_local_deploy.tgz
rm -f /tmp/blockminer_local_deploy.tgz
compose=(docker compose)
if [[ -f .env.production ]]; then compose+=(--env-file .env.production); fi
if [[ "${{BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}}" == "1" ]]; then
  "${{compose[@]}}" build --no-cache phd app
else
  "${{compose[@]}}" build phd app
fi
"${{compose[@]}}" up -d db phd app
"${{compose[@]}}" exec -T app npx prisma migrate deploy --schema=server/prisma/schema.prisma || true
COMPOSE_PROFILES=proxy "${{compose[@]}}" up -d nginx || true
curl -sS -o /dev/null -w "health:%{{http_code}}\\n" http://127.0.0.1:3001/health || true
echo "[vm] docker steps finished"
"""


def main() -> int:
    if not (REPO_ROOT / ".git").is_dir():
        raise SystemExit(f"Not a git repo: {REPO_ROOT}")

    host, user, password = load_secret()
    app_root = (os.environ.get("VM_APP_ROOT") or "/root/block-miner-v3").strip()

    archive = _make_gzipped_archive()
    remote_tgz = "/tmp/blockminer_local_deploy.tgz"

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            host,
            username=user,
            password=password,
            timeout=120,
            banner_timeout=120,
            auth_timeout=120,
            look_for_keys=False,
            allow_agent=False,
        )

        size = archive.stat().st_size
        t0 = time.monotonic()
        sftp = client.open_sftp()
        print(f"[sftp] {archive.name} -> {user}@{host}:{remote_tgz} ({size} bytes)", flush=True)

        last = [0]

        def progress(done: int, total: int) -> None:
            if total <= 0:
                return
            step = 5 * 1024 * 1024
            if done == total or done - last[0] >= step:
                last[0] = done
                pct = 100.0 * done / total
                print(f"[sftp] {done / (1024 * 1024):.1f} / {total / (1024 * 1024):.1f} MiB ({pct:.0f}%)", flush=True)

        sftp.put(str(archive), remote_tgz, callback=progress)
        sftp.close()
        print(f"[sftp] upload done in {time.monotonic() - t0:.1f}s", flush=True)

        # No PTY: avoids an interactive prompt hanging the session after long docker steps.
        stdin, stdout, stderr = client.exec_command("bash -s", get_pty=False)
        stdin.write(_remote_script(app_root))
        stdin.close()
        ch = stdout.channel
        while True:
            if ch.recv_ready():
                chunk = ch.recv(65536)
                if chunk:
                    os.write(1, chunk)
            if ch.recv_stderr_ready():
                chunk = ch.recv_stderr(65536)
                if chunk:
                    os.write(2, chunk)
            if ch.exit_status_ready():
                break
            time.sleep(0.25)
        code = ch.recv_exit_status()
        client.close()
        return int(code)
    finally:
        try:
            archive.unlink(missing_ok=True)
            archive.parent.rmdir()
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
