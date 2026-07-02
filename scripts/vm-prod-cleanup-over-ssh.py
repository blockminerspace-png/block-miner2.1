#!/usr/bin/env python3
"""
Run production cleanup on the BlockMiner VM and ensure automatic maintenance cron.

  python3 scripts/vm-prod-cleanup-over-ssh.py          # full cleanup now
  python3 scripts/vm-prod-cleanup-over-ssh.py --cron-only   # só instala cron

Credentials: scripts/vm_config_secret.py or VM_IP / VM_PASSWORD env vars.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import shlex
import sys
from pathlib import Path

try:
    import paramiko
except ImportError as e:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    raise SystemExit(1) from e

SCRIPT_DIR = Path(__file__).resolve().parent
SECRET = SCRIPT_DIR / "vm_config_secret.py"
MAINTENANCE_SH = SCRIPT_DIR / "vm-prod-maintenance.sh"
CRON_INSTALL_SH = SCRIPT_DIR / "install-vm-maintenance-cron.sh"


def load_secret() -> tuple[str, str, str]:
    if SECRET.exists():
        spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
        if spec is None or spec.loader is None:
            raise RuntimeError("Cannot load vm_config_secret.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        ip = str(getattr(mod, "IP", "") or "").strip()
        login = str(getattr(mod, "LOGIN", "root") or "").strip()
        pw = str(getattr(mod, "ROOT_PASSWORD", "") or "").strip()
        if ip and login and pw:
            return ip, login, pw
    ip = (os.environ.get("VM_IP") or "").strip()
    login = (os.environ.get("VM_USER") or "root").strip()
    pw = (os.environ.get("VM_PASSWORD") or "").strip()
    if not (ip and pw):
        raise SystemExit(
            "Missing credentials: scripts/vm_config_secret.py or VM_IP + VM_PASSWORD"
        )
    return ip, login, pw


def _upload_scripts(sftp, app_root: str) -> str:
    remote_installed = f"{app_root.rstrip('/')}/scripts/vm-prod-maintenance.sh"
    cron_installed = f"{app_root.rstrip('/')}/scripts/install-vm-maintenance-cron.sh"
    scripts_dir = f"{app_root.rstrip('/')}/scripts"
    try:
        sftp.stat(scripts_dir)
    except OSError:
        pass
    for local, remote in (
        (MAINTENANCE_SH, remote_installed),
        (CRON_INSTALL_SH, cron_installed),
    ):
        with sftp.file(remote, "w") as f:
            f.write(local.read_text(encoding="utf-8"))
    return remote_installed


def main() -> int:
    parser = argparse.ArgumentParser(description="BlockMiner VM prod cleanup")
    parser.add_argument(
        "--cron-only",
        action="store_true",
        help="Only install/update maintenance cron (no cleanup run)",
    )
    args = parser.parse_args()

    if not MAINTENANCE_SH.is_file():
        raise SystemExit(f"Missing {MAINTENANCE_SH}")
    if not CRON_INSTALL_SH.is_file():
        raise SystemExit(f"Missing {CRON_INSTALL_SH}")

    host, user, password = load_secret()
    app_root = (os.environ.get("VM_APP_ROOT") or "/root/block-miner-v3").strip()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username=user,
        password=password,
        timeout=120,
        look_for_keys=False,
        allow_agent=False,
    )

    remote_path = "/tmp/blockminer_prod_maintenance.sh"
    sftp = client.open_sftp()
    remote_installed = _upload_scripts(sftp, app_root)
    if not args.cron_only:
        with sftp.file(remote_path, "w") as f:
            f.write(MAINTENANCE_SH.read_text(encoding="utf-8"))
    sftp.close()

    cron_installed = f"{app_root.rstrip('/')}/scripts/install-vm-maintenance-cron.sh"
    parts = [
        f"chmod +x {shlex.quote(remote_installed)} {shlex.quote(cron_installed)}",
        f"bash {shlex.quote(cron_installed)} {shlex.quote(app_root)}",
    ]
    if not args.cron_only:
        parts.insert(
            1,
            f"APP_ROOT={shlex.quote(app_root)} BM_MAINTENANCE_MODE=full bash {shlex.quote(remote_path)}",
        )
        parts.append(f"rm -f {shlex.quote(remote_path)}")
    cmd = " && ".join(parts)

    print(f"[ssh] {user}@{host} …", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(out, end="" if out.endswith("\n") else "\n", flush=True)
    if err:
        print(err, file=sys.stderr, flush=True)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
