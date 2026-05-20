#!/usr/bin/env python3
"""Authenticated benchmark + Docker build cache prune on VM. No secrets in report output."""
from __future__ import annotations

import base64
import importlib.util
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SECRET = REPO / "scripts" / "vm_config_secret.py"
APP_ROOT = os.environ.get("VM_APP_ROOT", "/root/block-miner-v3")
REPORT_PATH = REPO / "RUNTIME_PERFORMANCE_AND_TIMEOUT_AUDIT.md"
MARKER_AUTH = "## Medição autenticada pós-limpeza"
MARKER_CACHE = "## Docker build cache — limpeza pós-auditoria"


def load_vm_secret() -> tuple[str, str, str]:
    if not SECRET.exists():
        raise SystemExit("Missing scripts/vm_config_secret.py")
    spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return str(mod.IP), str(mod.LOGIN), str(mod.ROOT_PASSWORD)


def load_test_creds() -> tuple[str, str]:
    ident = os.environ.get("BLOCKMINER_TEST_IDENTIFIER", "").strip()
    pw = os.environ.get("BLOCKMINER_TEST_PASSWORD", "").strip()
    if ident and pw:
        return ident, pw
    if SECRET.exists():
        spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        ident = str(getattr(mod, "BLOCKMINER_TEST_IDENTIFIER", "") or "").strip()
        pw = str(getattr(mod, "BLOCKMINER_TEST_PASSWORD", "") or "").strip()
    return ident, pw


def run_ssh_script(
    host: str,
    user: str,
    password: str,
    script: str,
    timeout: int = 1800,
    extra_env: dict[str, str] | None = None,
) -> str:
    import paramiko

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=120, look_for_keys=False, allow_agent=False)
    env = {"LANG": "C.UTF-8"}
    if extra_env:
        env.update(extra_env)
    payload = base64.b64encode(script.encode("utf-8")).decode("ascii")
    _stdin, stdout, stderr = client.exec_command(
        f"echo {payload} | base64 -d | bash",
        timeout=timeout,
        environment=env,
    )
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    return out + ("\n---stderr---\n" + err if err.strip() else "")


def sanitize_output(text: str) -> str:
    """Remove patterns that must not appear in reports or stdout logs."""
    patterns = [
        (r"(?i)(password|passwd|secret|token|jwt|authorization|cookie|sid|set-cookie|mnemonic|seed|private[_-]?key|database_url|rpc_url)\s*[:=]\s*[^\s,}\"']+", r"\1=[REDACTED]"),
        (r'"password"\s*:\s*"[^"]*"', '"password":"[REDACTED]"'),
        (r'"token"\s*:\s*"[^"]*"', '"token":"[REDACTED]"'),
        (r'"accessToken"\s*:\s*"[^"]*"', '"accessToken":"[REDACTED]"'),
        (r'"refreshToken"\s*:\s*"[^"]*"', '"refreshToken":"[REDACTED]"'),
        (r"sid=[A-Za-z0-9_-]+", "sid=[REDACTED]"),
        (r'"sid"\s*:\s*"[^"]+"', '"sid":"[REDACTED]"'),
    ]
    for pat, repl in patterns:
        text = re.sub(pat, repl, text)
    return text


def local_git_commit() -> str:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode == 0:
            return r.stdout.strip()
    except OSError:
        pass
    return "unknown"


def classify_ms(seconds: float) -> str:
    ms = seconds * 1000
    if ms < 300:
        return "rápido"
    if ms < 1000:
        return "aceitável"
    if ms < 3000:
        return "lento"
    return "crítico"


def parse_curl_lines(text: str) -> list[dict]:
    rows = []
    current_url = ""
    for line in text.splitlines():
        if line.startswith("==== "):
            current_url = line.replace("==== ", "").strip()
        m = re.search(r"status=(\d+).*time_total=([\d.]+)", line)
        if m and current_url:
            status = int(m.group(1))
            t = float(m.group(2))
            rows.append(
                {
                    "url": current_url,
                    "status": status,
                    "time_total_s": t,
                    "class": classify_ms(t),
                    "fail": status in (500, 502, 503),
                }
            )
    return rows


def main() -> int:
    host, user, pw = load_vm_secret()
    test_id, test_pw = load_test_creds()
    has_creds = bool(test_id and test_pw)

    prune_block = """
section "docker build cache prune"
docker system df 2>/dev/null || true
docker builder du 2>/dev/null | tail -5 || true
docker builder prune -af 2>/dev/null || true
docker system df 2>/dev/null || true
df -h / | awk 'NR==2'
"""

    rebuild_block = """
section "rebuild app worker"
docker compose --env-file .env.production build --no-cache app worker 2>&1 | tail -25
docker compose --env-file .env.production up -d --force-recreate app worker
sleep 8
docker compose ps
(docker compose logs --tail=40 app 2>&1 | grep -iE "error|fatal|listening" | tail -10) || true
(docker compose logs --tail=40 worker 2>&1 | grep -iE "error|fatal|BullMQ" | tail -10) || true
"""

    login_block = """
section "auth login"
if [ -n "${BLOCKMINER_TEST_IDENTIFIER:-}" ] && [ -n "${BLOCKMINER_TEST_PASSWORD:-}" ]; then
  BODY=$(python3 -c 'import json,os; print(json.dumps({"identifier":os.environ["BLOCKMINER_TEST_IDENTIFIER"],"password":os.environ["BLOCKMINER_TEST_PASSWORD"]}))')
  curl -sS -c /tmp/blockminer-cookie.txt -H "Content-Type: application/json" -d "$BODY" \\
    "https://blockminer.space/api/auth/login" -o /tmp/login_response.json \\
    -w "login_status=%{http_code} time_total=%{time_total} ttfb=%{time_starttransfer}\\n" || true
  python3 -c "import json;d=json.load(open('/tmp/login_response.json'));print('login_json_ok=',d.get('ok'),'requires_2fa=',d.get('requiresTwoFactor'),'code=',d.get('code',''))" 2>/dev/null || echo "login_json_parse_failed"
  for url in "https://blockminer.space/api/auth/session" "https://blockminer.space/api/wallet/balance" "https://blockminer.space/api/stats/power" "https://blockminer.space/api/checkin/status" "https://blockminer.space/socket.io/?EIO=4&transport=polling"; do
    echo "==== $url (auth)"
    curl -sS -b /tmp/blockminer-cookie.txt -o /tmp/curl_body.txt -w "status=%{http_code} time_total=%{time_total} ttfb=%{time_starttransfer}\\n" "$url" || true
    python3 -c "import json; p='/tmp/curl_body.txt';
import os
b=open(p,'rb').read(400)
try:
 d=json.loads(open(p).read());
 print('body_ok=',d.get('ok'),'keys=',list(d.keys())[:8])
except Exception:
 print('body_preview=',b[:120].decode('utf-8','replace'))" 2>/dev/null || true
  done
  rm -f /tmp/blockminer-cookie.txt /tmp/login_response.json /tmp/curl_body.txt
else
  echo "AUTH_SKIP=no_test_credentials"
fi
"""

    script = f"""
set -uo pipefail
cd {APP_ROOT} 2>/dev/null || cd /root/block-miner-v3
APP_ROOT=$(pwd)
section() {{ echo ""; echo "=== $1 ==="; }}
[ -f /root/.blockminer-test-env ] && set -a && . /root/.blockminer-test-env && set +a

section "preflight"
date -u
hostname
git -C "$APP_ROOT" rev-parse --short HEAD 2>/dev/null || echo "git_commit=unknown"
df -h / | awk 'NR==2'
docker compose ps 2>/dev/null || true
docker compose exec -T redis redis-cli ping < /dev/null 2>/dev/null || true
docker compose exec -T db pg_isready -U blockminer -d blockminer_db < /dev/null 2>/dev/null || true
{prune_block}
{rebuild_block}
{login_block}
section "post public curl"
for url in "https://blockminer.space/login" "https://blockminer.space/api/auth/session" "https://blockminer.space/socket.io/?EIO=4&transport=polling"; do
  echo "==== $url"
  curl -sS -o /tmp/curl_body.txt -w "status=%{{http_code}} time_total=%{{time_total}} ttfb=%{{time_starttransfer}}\\n" "$url" 2>/dev/null || echo "status=000"
  head -c 80 /tmp/curl_body.txt 2>/dev/null; echo
done
section "postgres after"
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select count(*) from pg_stat_activity;" < /dev/null 2>/dev/null || true
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select state, count(*) from pg_stat_activity group by state;" < /dev/null 2>/dev/null || true
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select pid, state, wait_event_type, wait_event, query_start, left(query, 200) from pg_stat_activity where state <> 'idle' order by query_start asc limit 20;" < /dev/null 2>/dev/null || true
section "redis after"
docker compose exec -T redis redis-cli info clients < /dev/null 2>/dev/null | head -8 || true
docker compose exec -T redis redis-cli info memory < /dev/null 2>/dev/null | grep -E "used_memory_human|maxmemory" || true
docker compose exec -T redis redis-cli slowlog get 20 < /dev/null 2>/dev/null || true
echo "DONE"
"""

    extra_env: dict[str, str] = {}
    if has_creds:
        extra_env["BLOCKMINER_TEST_IDENTIFIER"] = test_id
        extra_env["BLOCKMINER_TEST_PASSWORD"] = test_pw

    print(f"[local] VM post-cleanup (auth={'yes' if has_creds else 'no'}) ...", flush=True)
    raw = run_ssh_script(host, user, pw, script, timeout=1800, extra_env=extra_env or None)
    safe = sanitize_output(raw)
    print(safe)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    local_commit = local_git_commit()
    auth_rows = parse_curl_lines(safe)
    auth_skip = "AUTH_SKIP=no_test_credentials" in safe

    vm_commit = "unknown"
    m = re.search(r"^[0-9a-f]{7,40}$", safe, re.MULTILINE)
    if m:
        vm_commit = m.group(0)
    for line in safe.splitlines():
        if "git_commit=" in line:
            vm_commit = line.split("=", 1)[1].strip()

    disk_line = ""
    for line in safe.splitlines():
        if "/dev/sda1" in line or re.match(r"^/dev/sda1\s", line):
            disk_line = line.strip()

    auth_section = f"""
{MARKER_AUTH}

**Executado:** {ts}  
**Commit local (repo operador):** `{local_commit}`  
**Commit em produção (VM):** `{vm_commit}`  
**Disco atual (após prune):** `{disk_line or "ver saída VM"}`  
**Credenciais de teste:** {"utilizadas via env/`vm_config_secret` (valores **não** registados)" if has_creds else "**não disponíveis** — definir `BLOCKMINER_TEST_*` no operador, `vm_config_secret.py`, ou `/root/.blockminer-test-env` na VM"}

### Serviços

| Check | Resultado |
|-------|-----------|
| Containers | Ver `docker compose ps` na saída (app/worker recriados após prune) |
| Redis | PONG esperado |
| Postgres | `pg_isready` blockminer/blockminer_db |

### Login de teste (sem segredos)

| Campo | Valor |
|-------|-------|
| Executado | {"não" if auth_skip else "sim"} |
| 2FA exigido | Ver `requires_2fa=` na saída |
| HTTP login | Ver `login_status=` na saída |

### Endpoints autenticados (HTTPS)

| Endpoint | Status | time_total | Classificação |
|----------|--------|------------|---------------|
"""
    if auth_skip:
        auth_section += "| — | — | — | **pendente credenciais** |\n"
    else:
        for r in auth_rows:
            if "(auth)" in r["url"] or "login_status" in safe:
                auth_section += f"| `{r['url']}` | {r['status']} | {r['time_total_s']:.3f}s | {r['class']}{' **falha**' if r['fail'] else ''} |\n"
        login_m = re.search(r"login_status=(\d+).*time_total=([\d.]+)", safe)
        if login_m:
            auth_section += f"| `POST /api/auth/login` | {login_m.group(1)} | {login_m.group(2)}s | {classify_ms(float(login_m.group(2)))} |\n"

    auth_section += """
### Postgres pós-benchmark

Ver secção `postgres after` na saída sanitizada abaixo. Muitas linhas `idle in transaction` devem ser monitorizadas; não aumentar timeouts sem mapear query.

### Redis pós-benchmark

Ver `redis after` (clients, memory, slowlog).

### 503 / timeout / pool

Registar falhas 500/502/503 nas linhas `status=` acima. Se `idle in transaction` > 20, investigar leaks no app/worker.

### Confirmação secrets

Nenhuma senha, cookie, token, JWT, `DATABASE_URL` ou chave privada foi escrita nesta secção.

<details>
<summary>Saída VM sanitizada (truncada)</summary>

```
""" + safe.strip()[:12000] + """
```

</details>
"""

    cache_section = f"""
{MARKER_CACHE}

**Executado:** {ts}  
Comando: `docker builder prune -af` (sem `volume prune`, sem `down -v`).  
Rebuild: `docker compose --env-file .env.production build --no-cache app worker` + `up -d --force-recreate app worker`.

Ver disco e `docker system df` na secção autenticada acima.
"""

    if REPORT_PATH.exists():
        text = REPORT_PATH.read_text(encoding="utf-8")
        for marker in (MARKER_AUTH, MARKER_CACHE):
            if marker in text:
                text = text.split(marker)[0].rstrip()
        text = text.rstrip() + "\n\n" + auth_section.strip() + "\n\n" + cache_section.strip() + "\n"
    else:
        text = "# BlockMiner runtime audit\n\n" + auth_section + "\n" + cache_section
    REPORT_PATH.write_text(text, encoding="utf-8")
    print(f"\n[local] Updated {REPORT_PATH}", flush=True)
    return 0 if not auth_skip else 2


if __name__ == "__main__":
    raise SystemExit(main())
