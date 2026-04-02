#!/usr/bin/env python3
"""
Block Miner — deploy via Docker Compose.

  - Sem argumentos remotos: corre na raiz do repo (útil com Docker local ou na VM após git pull).
  - Com --remote USER@HOST: SSH + git pull + docker compose (requer chave SSH; sem senha no script).

Exemplos:
  python scripts/deploy.py
  python scripts/deploy.py --no-cache
  python scripts/deploy.py --remote root@203.0.113.10 --path ~/block-miner
  python scripts/deploy.py --dry-run --remote root@203.0.113.10
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def quote_cmd(args: list[str]) -> str:
    return " ".join(shlex.quote(a) for a in args)


def run_local(cmd: list[str], *, cwd: Path, dry_run: bool) -> int:
    print("+", quote_cmd(cmd), flush=True)
    if dry_run:
        return 0
    try:
        subprocess.run(cmd, cwd=str(cwd), check=True)
    except subprocess.CalledProcessError as e:
        return int(e.returncode or 1)
    except FileNotFoundError:
        print("Erro: comando não encontrado (instala Docker e garante que 'docker' está no PATH).", file=sys.stderr)
        return 127
    return 0


def remote_cd_command(project_path: str) -> str:
    """Gera 'cd ...' seguro no bash remoto (tilde não expande dentro de shlex.quote)."""
    p = project_path.strip()
    if p == "~":
        return "cd ~"
    if p.startswith("~/"):
        return f"cd ~ && cd {shlex.quote(p[2:])}"
    return f"cd {shlex.quote(p)}"


def build_remote_script(
    *,
    project_path: str,
    git_pull: bool,
    no_cache: bool,
    service: str | None,
) -> str:
    lines = [
        "set -euo pipefail",
        remote_cd_command(project_path),
    ]
    if git_pull:
        lines.append("git pull --ff-only || git pull")
    build = ["docker", "compose", "build"]
    if no_cache:
        build.append("--no-cache")
    if service:
        build.append(service)
    lines.append(quote_cmd(build))
    up = ["docker", "compose", "up", "-d"]
    if service:
        up.extend(["--no-deps", service])
    lines.append(quote_cmd(up))
    lines.append(
        "curl -sS -o /dev/null -w 'health_http:%{http_code}\\n' http://127.0.0.1:3000/health || true"
    )
    return "\n".join(lines) + "\n"


def run_remote_ssh(
    target: str,
    script: str,
    *,
    dry_run: bool,
    extra_ssh_args: list[str],
) -> int:
    ssh_cmd = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", *extra_ssh_args, target, "bash", "-s"]
    print("+", quote_cmd(ssh_cmd), "<< 'REMOTE_SCRIPT'", flush=True)
    print(script, end="" if script.endswith("\n") else "\n", flush=True)
    print("REMOTE_SCRIPT", flush=True)
    if dry_run:
        return 0
    try:
        p = subprocess.run(
            ssh_cmd,
            input=script.encode("utf-8"),
            cwd=str(REPO_ROOT),
            check=True,
        )
        return int(p.returncode or 0)
    except subprocess.CalledProcessError as e:
        return int(e.returncode or 1)
    except FileNotFoundError:
        print("Erro: 'ssh' não encontrado (Windows: ativa OpenSSH Client ou usa Git Bash).", file=sys.stderr)
        return 127


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Block Miner — Docker Compose deploy")
    p.add_argument(
        "--remote",
        metavar="USER@HOST",
        help="Alvo SSH (chave pública autorizada no servidor)",
    )
    p.add_argument(
        "--path",
        default=os.environ.get("BLOCKMINER_REMOTE_PATH", "~/block-miner"),
        help="Diretório do projeto no servidor (default: ~/block-miner ou BLOCKMINER_REMOTE_PATH)",
    )
    p.add_argument(
        "--no-git-pull",
        action="store_true",
        help="Em --remote, não executar git pull",
    )
    p.add_argument(
        "--git-pull",
        action="store_true",
        help="Em deploy local, executar git pull antes do build",
    )
    p.add_argument(
        "--no-cache",
        action="store_true",
        help="docker compose build --no-cache",
    )
    p.add_argument(
        "--service",
        default="",
        help="Serviço compose opcional, ex.: app (faz up -d --no-deps SERVICE)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra comandos / script remoto sem executar",
    )
    return p


def main(argv: list[str]) -> int:
    parser = build_arg_parser()
    args, ssh_extra = parser.parse_known_args(argv)
    service = args.service.strip() or None

    if args.remote:
        git_pull = not args.no_git_pull
        script = build_remote_script(
            project_path=args.path,
            git_pull=git_pull,
            no_cache=args.no_cache,
            service=service,
        )
        return run_remote_ssh(
            args.remote,
            script,
            dry_run=args.dry_run,
            extra_ssh_args=ssh_extra,
        )

    if args.git_pull:
        rc = run_local(["git", "pull", "--ff-only"], cwd=REPO_ROOT, dry_run=args.dry_run)
        if rc != 0:
            rc = run_local(["git", "pull"], cwd=REPO_ROOT, dry_run=args.dry_run)
        if rc != 0:
            return rc

    build = ["docker", "compose", "-f", str(REPO_ROOT / "docker-compose.yml"), "build"]
    if args.no_cache:
        build.append("--no-cache")
    if service:
        build.append(service)
    rc = run_local(build, cwd=REPO_ROOT, dry_run=args.dry_run)
    if rc != 0:
        return rc

    up = ["docker", "compose", "-f", str(REPO_ROOT / "docker-compose.yml"), "up", "-d"]
    if service:
        up.extend(["--no-deps", service])
    rc = run_local(up, cwd=REPO_ROOT, dry_run=args.dry_run)
    if rc != 0:
        return rc

    run_local(
        ["curl", "-sS", "-o", "/dev/null", "-w", "health_http:%{http_code}\n", "http://127.0.0.1:3000/health"],
        cwd=REPO_ROOT,
        dry_run=args.dry_run,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
