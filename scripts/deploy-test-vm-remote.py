#!/usr/bin/env python3
"""
SSH deploy to the BlockMiner test VPS (see .cursor/rules/blockminer-test-vm.mdc).

1. From the repo root: `git push origin <branch>` so the VM pull matches your local commits.
2. SSH into the test VM and run `deploy-production-safe.sh` (git reset + Docker).

Reads credentials from scripts/vm_config_secret.py (gitignored) or env VM_IP / VM_USER / VM_PASSWORD.
Streams remote output until the remote bash session ends (long docker builds supported).

Env:
  BLOCKMINER_DOCKER_BUILD_NO_CACHE=1  — remote `deploy-production-safe.sh` runs `docker compose build --no-cache app`
  DEPLOY_TEST_VM_TIMEOUT_SEC          — max wait seconds (default 7200)
  SKIP_GIT_PUSH=1                     — do not run local `git push` (only redeploy what is already on GitHub)
  DEPLOY_GIT_BRANCH                   — branch for local push and remote checkout (default: main)

If `origin` is HTTPS, Git may prompt for username/password: use a GitHub **Personal Access Token**
as the password (not your account password), or run `gh auth login`, or switch `origin` to an SSH URL.
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
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


def _deploy_git_branch() -> str:
    """Branch name for local push and remote reset (alphanumeric, dot, hyphen, underscore)."""
    b = (os.environ.get("DEPLOY_GIT_BRANCH") or "main").strip()
    if not b:
        return "main"
    safe = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-/")
    if not all(c in safe for c in b):
        raise SystemExit(f"[deploy-test-vm-remote] Invalid DEPLOY_GIT_BRANCH: {b!r}")
    return b


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "y", "on")


def _git_origin_url(repo_root: Path) -> str:
    r = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    return (r.stdout or "").strip() if r.returncode == 0 else ""


def local_git_push(repo_root: Path, branch: str) -> None:
    """Push local commits so origin matches before the VM resets to origin/<branch>."""
    if _truthy_env("SKIP_GIT_PUSH"):
        print("[deploy-test-vm-remote] SKIP_GIT_PUSH=1 — skipping local git push.", file=sys.stderr)
        return

    if not (repo_root / ".git").is_dir():
        raise SystemExit(f"[deploy-test-vm-remote] Not a git repo: {repo_root}")

    st = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if st.returncode != 0:
        raise SystemExit(f"[deploy-test-vm-remote] git status failed: {st.stderr or st.stdout}")

    dirty = [ln for ln in (st.stdout or "").splitlines() if ln.strip()]
    if dirty:
        print(
            "[deploy-test-vm-remote] WARNING: uncommitted changes in working tree — "
            "only committed work is pushed. Commit or stash first if you need those files on GitHub.",
            file=sys.stderr,
        )

    origin_url = _git_origin_url(repo_root)
    uses_https = origin_url.lower().startswith("https://")
    if uses_https:
        print(
            "[deploy-test-vm-remote] origin uses HTTPS — Git may ask for credentials.\n"
            "  • Username: your GitHub username\n"
            "  • Password: a Personal Access Token (repo scope), not your GitHub account password\n"
            "  • Or run once: gh auth login\n"
            "  • Or switch to SSH: git remote set-url origin git@github.com:ORG/REPO.git",
            file=sys.stderr,
        )

    push_env = os.environ.copy()
    if not sys.stdin.isatty():
        push_env["GIT_TERMINAL_PROMPT"] = "0"
        if uses_https:
            print(
                "[deploy-test-vm-remote] stdin is not a TTY — GIT_TERMINAL_PROMPT=0 "
                "(push fails unless HTTPS credentials are cached).",
                file=sys.stderr,
            )

    print(f"[deploy-test-vm-remote] git push origin {branch} …", file=sys.stderr)
    push = subprocess.run(
        ["git", "push", "origin", branch],
        cwd=repo_root,
        env=push_env,
        check=False,
    )
    if push.returncode != 0:
        raise SystemExit(
            f"[deploy-test-vm-remote] git push origin {branch} failed (exit {push.returncode}).\n"
            "SSH: register your pubkey on GitHub (browser) OR run once:\n"
            "  export GITHUB_TOKEN=ghp_...   # classic PAT, scope write:public_key\n"
            "  python3 scripts/register_github_ssh_key.py\n"
            "Then: ssh -T git@github.com"
        )
    print(f"[deploy-test-vm-remote] Local push OK (origin/{branch}).", file=sys.stderr)


def build_remote_script(branch: str) -> str:
    prefix = "export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1\n" if _docker_no_cache_enabled() else ""
    # BRANCH must match what was just pushed from the developer machine.
    return prefix + f"""set -euo pipefail
APP_ROOT=/root/block-miner-v3
REPO=https://github.com/blockminerspace-png/block-miner-v3.git
BRANCH={branch}
mkdir -p "$(dirname "$APP_ROOT")"
if [ ! -d "$APP_ROOT/.git" ]; then
  git clone "$REPO" "$APP_ROOT"
fi
cd "$APP_ROOT"
git remote set-url origin "$REPO"
git fetch origin --prune
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  echo "[WARN] origin/$BRANCH missing; using main"
  git checkout main 2>/dev/null || git checkout -B main origin/main
  git reset --hard origin/main
  BRANCH=main
fi
export APP_ROOT GIT_BRANCH="$BRANCH" SKIP_APP_TARBALL=1 DEPLOY_GIT_MODE=reset START_NGINX_PROXY=1 APP_HOST_PORT=3001 DEPLOY_PRISMA_MIGRATE_DEPLOY=1
bash scripts/deploy-production-safe.sh
"""


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


def main() -> int:
    branch = _deploy_git_branch()
    local_git_push(REPO_ROOT, branch)

    host, user, password = load_secret()
    max_seconds = int(os.environ.get("DEPLOY_TEST_VM_TIMEOUT_SEC") or "7200")

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
    # No PTY: avoids echoing the script into an interactive shell on some hosts.
    stdin, stdout, stderr = client.exec_command("bash -s", get_pty=False)
    stdin.write(build_remote_script(branch))
    stdin.close()

    start = time.monotonic()
    ch = stdout.channel
    err_ch = stderr.channel

    try:
        while True:
            if ch.recv_ready():
                chunk = ch.recv(65536)
                if chunk:
                    os.write(1, chunk)
            if err_ch.recv_stderr_ready():
                chunk = err_ch.recv_stderr(65536)
                if chunk:
                    os.write(2, chunk)
            if ch.exit_status_ready():
                break
            if time.monotonic() - start > max_seconds:
                client.close()
                print("\n[deploy-test-vm-remote] TIMEOUT", file=sys.stderr)
                return 124
            time.sleep(0.2)
        code = ch.recv_exit_status()
        return int(code)
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
