#!/usr/bin/env python3
"""
Alias para o deploy Paramiko oficial (HEAD → tarball → SFTP → VM → docker compose).

Credenciais: `scripts/vm_config_secret.py` (gitignored) ou env `VM_IP`, `VM_USER`, `VM_PASSWORD`.
Ver `scripts/vm-deploy-local-over-ssh.py`.

Uso:
  python3 scripts/deploy_remote.py
  python3 scripts/deploy_remote.py   # argumentos extra são repassados ao script base
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TARGET = SCRIPT_DIR / "vm-deploy-local-over-ssh.py"


def main() -> int:
    if not TARGET.is_file():
        print(f"Missing {TARGET}", file=sys.stderr)
        return 2
    cmd = [sys.executable, str(TARGET), *sys.argv[1:]]
    return int(subprocess.call(cmd))


if __name__ == "__main__":
    raise SystemExit(main())
