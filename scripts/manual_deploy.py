#!/usr/bin/env python3
"""Envia `blockminer.zip` na raiz do repo para a VM (usa credenciais de `vm_config_secret.py`)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ZIP_DEFAULT = REPO_ROOT / "blockminer-deploy.zip"
ZIP_LEGACY = REPO_ROOT / "blockminer.zip"
TARGET = SCRIPT_DIR / "vm-deploy-local-over-ssh.py"


def main() -> int:
    zip_path = ZIP_DEFAULT if ZIP_DEFAULT.is_file() else ZIP_LEGACY
    if not zip_path.is_file():
        print(
            f"Coloca um arquivo ZIP na raiz do repo. Procurados: {ZIP_DEFAULT.name}, {ZIP_LEGACY.name}\n"
            "Gera um ZIP só com ficheiros Git (sem .env):  bash scripts/make-deploy-zip.sh",
            file=sys.stderr,
        )
        return 2
    if not TARGET.is_file():
        print(f"Missing {TARGET}", file=sys.stderr)
        return 2
    cmd = [sys.executable, str(TARGET), "--zip", str(zip_path), *sys.argv[1:]]
    return int(subprocess.call(cmd))


if __name__ == "__main__":
    raise SystemExit(main())
