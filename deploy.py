#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BlockMiner deploy entrypoint (Windows + PuTTY).

Do not store SSH passwords in this file. Use one of:
  - Environment variable BLOCKMINER_VPS_PW
  - deploy.secrets.local key SSH_PASSWORD (see deploy.secrets.example)
  - Single-line file .deploy-pw.txt at repo root (gitignored; password only)

Optional: set DEPLOY_GIT_BRANCH=main in the environment to force the VPS git reset to origin/main
(overrides DEPLOY_GIT_BRANCH in deploy.secrets.local — use when production must track main).

Optional docstring hints (no secrets):
  - Server IP: 89.167.119.164
  - SSH User: root
  - Repository: https://github.com/blockminerspace-png/block-miner-v3.git
  - Application URL: https://blockminer.space
  - Troubleshooting: see docs/DEPLOYMENT.md (health retries, APP_HOST_PORT, Prisma order)
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent
PS1 = REPO / "scripts" / "deploy-vps-windows.ps1"
SECRETS_LOCAL = REPO / "deploy.secrets.local"


def _parse_simple_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip()
        if k:
            out[k] = v
    return out


def _read_deploy_pw_txt(repo: Path) -> str:
    path = repo / ".deploy-pw.txt"
    if not path.is_file():
        return ""
    try:
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        return (lines[0] if lines else "").strip()
    except OSError:
        return ""


def _parse_credentials(doc: str) -> dict[str, str]:
    """Non-secret defaults from docstring (host, user, repo, url)."""
    out: dict[str, str] = {}
    patterns = [
        ("host", r"- Server IP:\s*(.+)"),
        ("user", r"- SSH User:\s*(.+)"),
        ("repository", r"- Repository:\s*(.+)"),
        ("app_url", r"- Application URL:\s*(.+)"),
    ]
    for key, pat in patterns:
        m = re.search(pat, doc, re.MULTILINE)
        if m:
            out[key] = m.group(1).strip()
    return out


def main() -> int:
    doc = (__doc__ or "").strip()
    cred = _parse_credentials(doc)
    secrets = _parse_simple_env_file(SECRETS_LOCAL)

    password = (os.environ.get("BLOCKMINER_VPS_PW") or "").strip()
    if not password:
        password = secrets.get("SSH_PASSWORD", "").strip()
    if not password:
        password = _read_deploy_pw_txt(REPO)
    if not password:
        pw_file = REPO / ".deploy-pw.txt"
        print(
            "deploy.py: SSH password missing. Use ONE of:\n"
            "  - $env:BLOCKMINER_VPS_PW = '...' (PowerShell) then python deploy.py\n"
            f"  - SSH_PASSWORD=... in {SECRETS_LOCAL}\n"
            f"  - Create {pw_file} with a single line (root password only; file is gitignored)\n",
            file=sys.stderr,
        )
        return 1

    # deploy.secrets.local wins so test/staging hosts override docstring defaults.
    host = secrets.get("SSH_HOST", "").strip() or cred.get("host", "").strip()
    user = secrets.get("SSH_USER", "").strip() or cred.get("user", "").strip()
    if not host or not user:
        print(
            "deploy.py: faltam Server IP / SSH User no docstring ou SSH_HOST / SSH_USER em deploy.secrets.local.",
            file=sys.stderr,
        )
        return 1

    no_cache = "--no-cache" in sys.argv
    argv_rest = [a for a in sys.argv[1:] if a != "--no-cache"]

    if sys.platform != "win32":
        print(
            "deploy.py: neste SO usa SSH com chave, ex.: "
            f"python scripts/deploy.py --remote {user}@{host} --path /root/block-miner --service app",
            file=sys.stderr,
        )
        return 1

    if not PS1.is_file():
        print(f"deploy.py: nao encontrei {PS1}", file=sys.stderr)
        return 1

    env = os.environ.copy()
    env["BLOCKMINER_VPS_PW"] = password

    ps_cmd = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(PS1),
        "-SshHost",
        host,
        "-SshUser",
        user,
    ]
    if no_cache:
        ps_cmd.append("-NoDockerCache")

    for a in argv_rest:
        ps_cmd.append(a)

    print("+", " ".join(ps_cmd[:6]), "... [deploy-vps-windows.ps1]", flush=True)
    try:
        return subprocess.call(ps_cmd, cwd=str(REPO), env=env)
    except OSError as e:
        print(f"deploy.py: falha ao executar PowerShell: {e}", file=sys.stderr)
        return 127


if __name__ == "__main__":
    raise SystemExit(main())
