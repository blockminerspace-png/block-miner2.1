#!/usr/bin/env python3
"""
Set a non-empty Polygonscan / Etherscan V2 API key on the test VPS .env.production and restart `app`.

Reads the key from the **calling environment only** (never from argv):
  export POLYGONSCAN_API_KEY='your_key'   # or ETHERSCAN_API_KEY
  python3 scripts/patch-test-vm-polygonscan-key.py

Uses the same SSH credentials as scripts/deploy-test-vm-remote.py.
Does not print the key.
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys
from pathlib import Path

try:
    import paramiko
except ImportError as e:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    raise SystemExit(1) from e

SCRIPT_DIR = Path(__file__).resolve().parent
SECRET = SCRIPT_DIR / "vm_config_secret.py"
DEFAULT_REMOTE = "/root/block-miner-v3/.env.production"
COMPOSE_DIR = "/root/block-miner-v3"


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
            "Missing VM credentials: scripts/vm_config_secret.py or VM_IP + VM_PASSWORD."
        )
    return ip, login, pw


def pick_key() -> str:
    a = (os.environ.get("POLYGONSCAN_API_KEY") or "").strip()
    b = (os.environ.get("ETHERSCAN_API_KEY") or "").strip()
    return a or b


def upsert_env_var(text: str, name: str, value: str) -> str:
    """Replace VAR=... line or append VAR=value at end (Etherscan v2 key works for Polygon chainid=137)."""
    pat = re.compile(rf"^{re.escape(name)}=.*$", re.MULTILINE)
    line = f"{name}={value}"
    if pat.search(text):
        return pat.sub(line, text, count=1)
    sep = "" if text.endswith("\n") else "\n"
    return text.rstrip("\n") + sep + line + "\n"


def inject_scanner_keys(text: str, key_value: str) -> str:
    t = upsert_env_var(text, "POLYGONSCAN_API_KEY", key_value)
    return upsert_env_var(t, "ETHERSCAN_API_KEY", key_value)


def main() -> int:
    key = pick_key()
    if len(key) < 8:
        raise SystemExit(
            "Set POLYGONSCAN_API_KEY or ETHERSCAN_API_KEY in the environment to a non-empty "
            "Etherscan API v2 key (https://etherscan.io/apidashboard), then re-run this script."
        )

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
                current = fh.read().decode("utf-8", errors="strict")
        except FileNotFoundError:
            print(f"[patch-polygonscan] ERROR: missing {remote}", file=sys.stderr)
            return 2

        updated = inject_scanner_keys(current, key)
        with sftp.open(remote, "w") as out:
            out.write(updated.encode("utf-8"))
        print(f"[patch-polygonscan] Updated {remote} (keys not printed).", file=sys.stderr)

        restart = (
            f"cd {COMPOSE_DIR} && docker compose --env-file .env.production up -d app "
            "&& docker compose --env-file .env.production exec -T app printenv POLYGONSCAN_API_KEY "
            "| wc -c"
        )
        stdin, stdout, stderr = client.exec_command(restart)
        out = stdout.read().decode() + stderr.read().decode()
        # wc -c includes newline; expect key_len+1
        print("[patch-polygonscan] Restart output (byte count of env check):", out.strip(), file=sys.stderr)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
