#!/usr/bin/env python3
"""Thin wrapper — canonical deploy is vm-deploy-local-over-ssh.py."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
script = ROOT / "scripts" / "vm-deploy-local-over-ssh.py"
raise SystemExit(subprocess.call([sys.executable, str(script), *sys.argv[1:]]))
