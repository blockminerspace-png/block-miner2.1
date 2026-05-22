#!/usr/bin/env python3
"""
Deploy BlockMiner test VPS **without git on the server** (no `git fetch` / GitHub).

Use when the repo is private and the VM has no PAT/SSH key, or when you want the
exact tree from **your local** `git HEAD` (committed files only).

From repo root:

  python3 scripts/vm-deploy-local-over-ssh.py
  python3 scripts/vm-deploy-local-over-ssh.py --zip ~/Documentos/BlockMiner\\ 2.1.zip
  BLOCKMINER_DEPLOY_ZIP=/path/to/file.zip python3 scripts/vm-deploy-local-over-ssh.py

Credentials: `scripts/vm_config_secret.py` (copy from `vm_config_secret.example.py`)
or env `VM_IP`, `VM_USER`, `VM_PASSWORD`.

Never overwrites server `.env` / `.env.production` (backed up before extract, restored after).

Optional env:
  BLOCKMINER_DEPLOY_ZIP=path         — upload this .zip instead of `git archive` (same as --zip)
  VM_APP_ROOT=/root/block-miner-v3   — remote app directory (must exist)
  BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 — `docker compose build --no-cache app worker`
  SKIP_DOCKER=1                     — only upload + extract tracked files (no compose)

Requires: paramiko, local `git`, remote `docker` + same compose layout as production deploy.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import shlex
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


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Deploy BlockMiner tree to VM over SSH (Paramiko)")
    p.add_argument(
        "--zip",
        metavar="PATH",
        default=os.environ.get("BLOCKMINER_DEPLOY_ZIP", "").strip() or None,
        help="Local .zip to upload instead of git-archive HEAD (or set BLOCKMINER_DEPLOY_ZIP)",
    )
    return p.parse_args(argv)


def _resolve_zip_path(raw: str) -> Path:
    z = Path(raw).expanduser()
    if not z.is_absolute():
        z = (REPO_ROOT / z).resolve()
    if not z.is_file():
        raise SystemExit(f"ZIP not found or not a file: {z}")
    if z.suffix.lower() != ".zip":
        raise SystemExit(f"Expected a .zip file, got: {z}")
    return z


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


def _remote_script(app_root: str, *, archive_basename: str, extract_kind: str) -> str:
    """extract_kind: 'tgz' (tar.gz) or 'zip'."""
    no_cache = "export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1\n" if _docker_no_cache_enabled() else ""
    remote_arc = f"/tmp/{archive_basename}"
    # Never let `unzip -o` / tar replace server-side secrets: backup env files, extract, restore into final APP_ROOT.
    env_restore_loop = """for f in .env .env.production .env.production.vm-backup deploy.secrets.local; do
  if [[ -f "$BM_ENV_BACKUP/$f" ]]; then cp -a "$BM_ENV_BACKUP/$f" "$APP_ROOT/$f"; fi
done
rm -rf "$BM_ENV_BACKUP"
"""
    env_backup_loop = """BM_ENV_BACKUP="$(mktemp -d /tmp/bm-env-XXXXXX)"
for f in .env .env.production .env.production.vm-backup deploy.secrets.local; do
  if [[ -f "$APP_ROOT/$f" ]]; then cp -a "$APP_ROOT/$f" "$BM_ENV_BACKUP/$f"; fi
done
"""
    compose_discover = """if [[ ! -f "$APP_ROOT/docker-compose.yml" ]]; then
  for cand in "$APP_ROOT"/*; do
    if [[ -d "$cand" && -f "$cand/docker-compose.yml" ]]; then
      APP_ROOT="$cand"
      break
    fi
  done
fi
"""
    if extract_kind == "zip":
        extract = f'''command -v unzip >/dev/null 2>&1 || {{ apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip; }}
mkdir -p "$APP_ROOT"
{env_backup_loop}
unzip -o -q "{remote_arc}" -d "$APP_ROOT"
rm -f "{remote_arc}"
{compose_discover}
{env_restore_loop}
'''
    else:
        extract = f'''mkdir -p "$APP_ROOT"
{env_backup_loop}
cd "$APP_ROOT"
tar xzf "{remote_arc}"
rm -f "{remote_arc}"
{compose_discover}
{env_restore_loop}
'''
    docker_stack = r'''
export APP_ROOT
export BLOCKMINER_DOCKER_BUILD_NO_CACHE="${BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}"
cd "$APP_ROOT"
compose() {
  local -a c=(docker compose -f "$APP_ROOT/docker-compose.yml")
  if [[ -f "$APP_ROOT/.env.production" ]]; then
    c+=(--env-file "$APP_ROOT/.env.production")
  fi
  "${c[@]}" "$@"
}
if [[ -d /root/support-block-miner ]]; then
  (cd /root/support-block-miner && docker compose down --remove-orphans) 2>/dev/null || true
fi
for old in block-miner-app-1 block-miner-worker-1 block-miner-nginx-1 block-miner-db-1 block-miner-redis-1; do
  docker rm -f "$old" 2>/dev/null || true
done
if [[ "${BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}" == "1" ]]; then
  compose build --no-cache app worker
else
  compose build app worker
fi
compose up -d --remove-orphans db redis app worker nginx
if ! ss -tlnp 2>/dev/null | grep -qF ':80 '; then
  compose up -d --force-recreate --no-deps nginx || true
fi
compose exec -T app npx prisma migrate deploy --schema=server/prisma/schema.prisma || true
curl -sS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:3000/health || true
echo "[vm] docker steps finished"
'''
    if _skip_docker():
        return f"""set -euo pipefail
{no_cache}APP_ROOT={shlex.quote(app_root)}
{extract}echo "[vm] extract OK (SKIP_DOCKER=1)"
"""
    return f"""set -euo pipefail
{no_cache}APP_ROOT={shlex.quote(app_root)}
{extract}{docker_stack}
"""


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    use_zip = bool(args.zip)
    if use_zip:
        archive = _resolve_zip_path(args.zip or "")
        archive_is_temp = False
        remote_name = "blockminer_local_deploy.zip"
        extract_kind = "zip"
        print(f"[local] using zip {archive.stat().st_size} bytes -> {archive}", flush=True)
    else:
        if not (REPO_ROOT / ".git").is_dir():
            raise SystemExit(f"Not a git repo: {REPO_ROOT}")
        archive = _make_gzipped_archive()
        archive_is_temp = True
        remote_name = "blockminer_local_deploy.tgz"
        extract_kind = "tgz"

    remote_path = f"/tmp/{remote_name}"
    host, user, password = load_secret()
    app_root = (os.environ.get("VM_APP_ROOT") or "/root/block-miner-v3").strip()

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
        print(f"[sftp] {archive.name} -> {user}@{host}:{remote_path} ({size} bytes)", flush=True)

        last = [0]

        def progress(done: int, total: int) -> None:
            if total <= 0:
                return
            step = 5 * 1024 * 1024
            if done == total or done - last[0] >= step:
                last[0] = done
                pct = 100.0 * done / total
                print(f"[sftp] {done / (1024 * 1024):.1f} / {total / (1024 * 1024):.1f} MiB ({pct:.0f}%)", flush=True)

        sftp.put(str(archive), remote_path, callback=progress)
        sftp.close()
        print(f"[sftp] upload done in {time.monotonic() - t0:.1f}s", flush=True)

        # No PTY: avoids an interactive prompt hanging the session after long docker steps.
        stdin, stdout, stderr = client.exec_command("bash -s", get_pty=False)
        stdin.write(_remote_script(app_root, archive_basename=remote_name, extract_kind=extract_kind))
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
        if archive_is_temp:
            try:
                archive.unlink(missing_ok=True)
                archive.parent.rmdir()
            except OSError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
