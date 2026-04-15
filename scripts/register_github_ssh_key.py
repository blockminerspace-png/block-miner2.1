#!/usr/bin/env python3
"""
Upload the local SSH *public* key to your GitHub account via the REST API.

GitHub must accept the key before `git push` over SSH works. This avoids pasting
in the browser if you provide a Personal Access Token once.

Setup (one time):
  1. Create a classic PAT: https://github.com/settings/tokens
     Enable scope: **write:public_key** (or **admin:public_key**).
  2. Export:   export GITHUB_TOKEN=ghp_xxxxxxxx

Run:
  python3 scripts/register_github_ssh_key.py
  python3 scripts/register_github_ssh_key.py ~/.ssh/id_ed25519.pub

Env:
  GITHUB_TOKEN or GH_TOKEN — required
  GITHUB_KEY_TITLE          — optional title (default: hostname + blockminer)
"""
from __future__ import annotations

import json
import os
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.github.com/user/keys"


def normalize_openssh_public_key(raw: str, path: Path) -> str:
    """
    One line, OpenSSH format: <algorithm> <base64> [comment]
    GitHub rejects extra whitespace, CRLF, or pasting the private key by mistake.
    """
    if "PRIVATE KEY" in raw or "OPENSSH PRIVATE KEY" in raw:
        raise ValueError(
            f"{path}: this looks like a **private** key. Never paste or upload that. "
            "Use the .pub file only (one line, starts with ssh-ed25519 or ssh-rsa)."
        )
    text = raw.replace("\r\n", "\n").replace("\r", "\n").strip()
    line = text.split("\n", 1)[0].strip()
    parts = line.split()
    if len(parts) < 2:
        raise ValueError(f"{path}: expected 'ssh-... BASE64...' on one line, got: {line[:80]!r}")
    alg, blob = parts[0], parts[1]
    if not alg.startswith("ssh-"):
        raise ValueError(f"{path}: key must start with ssh-rsa, ssh-ed25519, ecdsa-sha2-*, etc.; got {alg!r}")
    if len(blob) < 40:
        raise ValueError(f"{path}: key payload looks too short to be a valid OpenSSH public key.")
    # Two fields are enough for GitHub; optional comment omitted for strict parsers.
    return f"{alg} {blob}"


def main() -> int:
    token = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()
    if not token:
        print(
            "Missing GITHUB_TOKEN (or GH_TOKEN).\n"
            "Create a classic PAT with scope **write:public_key**:\n"
            "  https://github.com/settings/tokens\n"
            "Then:  export GITHUB_TOKEN=ghp_...\n"
            "Re-run: python3 scripts/register_github_ssh_key.py",
            file=sys.stderr,
        )
        return 2

    pub_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / ".ssh" / "id_ed25519.pub"
    if not pub_path.is_file():
        print(f"Public key not found: {pub_path}", file=sys.stderr)
        return 2

    raw = pub_path.read_text(encoding="utf-8")
    try:
        key_body = normalize_openssh_public_key(raw, pub_path)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2

    title = (os.environ.get("GITHUB_KEY_TITLE") or "").strip() or f"{socket.gethostname()}-blockminer"

    payload = json.dumps({"title": title, "key": key_body}).encode("utf-8")
    req = urllib.request.Request(
        API,
        data=payload,
        method="POST",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "blockminer-register-github-ssh-key",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        if e.code == 422:
            el = err.lower()
            if "key is already in use" in el or "already exists" in el:
                print("This public key is already on your GitHub account. Try: ssh -T git@github.com", file=sys.stderr)
                return 0
            if "invalid" in el and "format" in el:
                print(
                    "GitHub says the key format is invalid. Fix:\n"
                    "  • Paste only ONE line from:  cat ~/.ssh/id_ed25519.pub\n"
                    "  • Do NOT paste id_ed25519 (no .pub) — that is the private key.\n"
                    "  • No quotes, no spaces at the start/end, no line breaks in the middle.",
                    file=sys.stderr,
                )
        print(f"GitHub API HTTP {e.code}: {err}", file=sys.stderr)
        if e.code == 403:
            print("Token may lack scope **write:public_key** (classic PAT).", file=sys.stderr)
        return 1

    try:
        data = json.loads(body)
        kid = data.get("id", "?")
    except json.JSONDecodeError:
        kid = "?"
    print(f"OK: SSH public key registered on GitHub (key id {kid}).")
    print("Run:  ssh -T git@github.com")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
