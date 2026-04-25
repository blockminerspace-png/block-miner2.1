#!/usr/bin/env python3
"""
Append a managed Polygon HD block to the test VPS .env.production (SSH).

- Idempotent: skips if # BLOCKMINER_POLYGON_HD_MANAGED_BEGIN is already present.
- Generates PHD_INTERNAL_TOKEN and POLYGON_HD_MNEMONIC locally (never printed).
- Uses the same credentials entry points as scripts/deploy-test-vm-remote.py.

Run from repo root after vm_config_secret.py (or VM_IP / VM_PASSWORD) is configured:

  python3 scripts/bootstrap-test-vm-polygon-hd-env.py

Optional env:
  TEST_VM_ENV_FILE   — remote path (default /root/block-miner-v3/.env.production)
"""
from __future__ import annotations

import importlib.util
import os
import secrets
import subprocess
import sys
from pathlib import Path

try:
    import paramiko
except ImportError as e:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    raise SystemExit(1) from e

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SECRET = SCRIPT_DIR / "vm_config_secret.py"
MARKER_BEGIN = "# BLOCKMINER_POLYGON_HD_MANAGED_BEGIN"
MARKER_END = "# BLOCKMINER_POLYGON_HD_MANAGED_END"
DEFAULT_REMOTE = "/root/block-miner-v3/.env.production"
SWEEP = "0x1ca03755c5132e238ae4e0f50d4929ea0d58b897"


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


def generate_mnemonic() -> str:
    r = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import { Wallet } from 'ethers'; console.log(Wallet.createRandom().mnemonic.phrase);",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if r.returncode != 0:
        raise SystemExit(f"ethers mnemonic generation failed: {r.stderr or r.stdout}")
    phrase = (r.stdout or "").strip()
    if not phrase or " " not in phrase:
        raise SystemExit("unexpected mnemonic output from ethers")
    return phrase


def main() -> int:
    remote = (os.environ.get("TEST_VM_ENV_FILE") or DEFAULT_REMOTE).strip()
    host, user, password = load_secret()

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
    try:
        sftp = client.open_sftp()
        try:
            with sftp.open(remote, "r") as fh:
                current = fh.read().decode("utf-8", errors="replace")
        except FileNotFoundError:
            print(f"[bootstrap-polygon-hd] ERROR: missing {remote}", file=sys.stderr)
            return 2

        if MARKER_BEGIN in current:
            print("[bootstrap-polygon-hd] Managed block already present — nothing to do.", file=sys.stderr)
            return 0

        token = secrets.token_hex(32)
        mnemonic = generate_mnemonic()
        # .env: quote mnemonic for spaces; token is hex only.
        quoted_mn = "'" + mnemonic.replace("'", "'\"'\"'") + "'"

        block = (
            f"\n{MARKER_BEGIN}\n"
            "POLYGON_HD_DEPOSIT_ENABLED=1\n"
            "PHD_SERVICE_URL=http://phd:3847\n"
            f"PHD_INTERNAL_TOKEN={token}\n"
            f"POLYGON_HD_MNEMONIC={quoted_mn}\n"
            f"POLYGON_HD_SWEEP_TO_ADDRESS={SWEEP}\n"
            "POLYGON_HD_AUTO_SWEEP=1\n"
            f"{MARKER_END}\n"
        )

        with sftp.open(remote, "w") as out:
            out.write((current.rstrip() + block).encode("utf-8"))

        print(
            "[bootstrap-polygon-hd] Appended HD block to "
            f"{remote} (mnemonic and token were not printed). "
            "Back up that file on the server if you need the phrase.",
            file=sys.stderr,
        )
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
