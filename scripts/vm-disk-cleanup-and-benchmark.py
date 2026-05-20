#!/usr/bin/env python3
"""Safe VM disk cleanup + endpoint benchmarks. No volume/DB/uploads deletion."""
from __future__ import annotations

import base64
import importlib.util
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

REPO = Path(__file__).resolve().parent.parent
SECRET = REPO / "scripts" / "vm_config_secret.py"
APP_ROOT = os.environ.get("VM_APP_ROOT", "/root/block-miner-v3")
REPORT_PATH = REPO / "RUNTIME_PERFORMANCE_AND_TIMEOUT_AUDIT.md"

MARKER = "## Limpeza segura de disco e medição pós-limpeza"


def load_secret() -> tuple[str, str, str]:
    if not SECRET.exists():
        raise SystemExit("Missing scripts/vm_config_secret.py")
    spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return str(mod.IP), str(mod.LOGIN), str(mod.ROOT_PASSWORD)


def run_ssh_script(
    host: str,
    user: str,
    password: str,
    script: str,
    timeout: int = 600,
    extra_env: dict[str, str] | None = None,
) -> str:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=120, look_for_keys=False, allow_agent=False)
    env = {"LANG": "C.UTF-8"}
    if extra_env:
        env.update(extra_env)
    # Feed script via base64 so we can close SSH stdin immediately (heredoc + stdin.close() truncated scripts).
    payload = base64.b64encode(script.encode("utf-8")).decode("ascii")
    stdin, stdout, stderr = client.exec_command(
        f"echo {payload} | base64 -d | bash",
        timeout=timeout,
        environment=env,
    )
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    return out + ("\n---stderr---\n" + err if err.strip() else "")


def main() -> int:
    host, user, pw = load_secret()
    test_id = os.environ.get("BLOCKMINER_TEST_IDENTIFIER", "").strip()
    test_pw = os.environ.get("BLOCKMINER_TEST_PASSWORD", "").strip()
    login_block = """
section "F9 session (test account)"
rm -f /tmp/blockminer-cookie.txt /tmp/login_response.json
if [ -n "${BLOCKMINER_TEST_IDENTIFIER:-}" ] && [ -n "${BLOCKMINER_TEST_PASSWORD:-}" ]; then
  BODY=$(python3 -c 'import json,os; print(json.dumps({"identifier":os.environ["BLOCKMINER_TEST_IDENTIFIER"],"password":os.environ["BLOCKMINER_TEST_PASSWORD"]}))')
  curl -sS -c /tmp/blockminer-cookie.txt -H "Content-Type: application/json" -d "$BODY" \\
    "https://blockminer.space/api/auth/login" -o /tmp/login_response.json \\
    -w "login_status=%{http_code} time_total=%{time_total} ttfb=%{time_starttransfer}\\n" || true
  head -c 500 /tmp/login_response.json
  echo
  for url in "https://blockminer.space/api/auth/session" "https://blockminer.space/api/wallet/balance" "https://blockminer.space/api/stats/power" "https://blockminer.space/api/checkin/status"; do
    echo "==== $url (auth)"
    curl -sS -b /tmp/blockminer-cookie.txt -o /tmp/curl_body.txt -w "status=%{http_code} time_total=%{time_total} ttfb=%{time_starttransfer}\\n" "$url" || true
    head -c 700 /tmp/curl_body.txt
    echo
  done
  rm -f /tmp/blockminer-cookie.txt /tmp/login_response.json
else
  echo "SKIP: set BLOCKMINER_TEST_IDENTIFIER and BLOCKMINER_TEST_PASSWORD on operator host to benchmark authenticated APIs"
fi
"""

    script = f"""
set -uo pipefail
cd {APP_ROOT} 2>/dev/null || cd /root/block-miner-v3 || exit 1
APP_ROOT=$(pwd)

section() {{ echo ""; echo "=== $1 ==="; }}

section "F1 initial"
date
hostname
uptime
free -h
df -h
df -i
docker system df 2>/dev/null || true
docker compose ps 2>/dev/null || true
docker stats --no-stream 2>/dev/null || true
DISK_BEFORE=$(df -h / | awk 'NR==2 {{print $5}}')
DISK_AVAIL_BEFORE=$(df -h / | awk 'NR==2 {{print $4}}')

section "F2 du scan (no delete)"
du -h -d 1 /var/lib/docker 2>/dev/null | sort -h | tail -15 || true
du -h -d 1 /root 2>/dev/null | sort -h | tail -15 || true
du -h -d 1 "$APP_ROOT" 2>/dev/null | sort -h | tail -20 || true
find "$APP_ROOT" -maxdepth 4 -type d \\( -name dist -o -name coverage -o -name node_modules -o -name .cache \\) 2>/dev/null | head -30 || true

section "F3 journal + logs"
journalctl --disk-usage 2>/dev/null || true
journalctl --vacuum-time=7d 2>/dev/null || true
journalctl --disk-usage 2>/dev/null || true
find /var/log -type f -name "*.gz" -mtime +7 -print 2>/dev/null | wc -l
find /var/log -type f -name "*.gz" -mtime +7 -delete 2>/dev/null || true
find /var/log -type f -name "*.1" -mtime +14 -print 2>/dev/null | wc -l
find /var/log -type f -name "*.1" -mtime +14 -delete 2>/dev/null || true

section "F4 docker safe prune"
docker system df 2>/dev/null || true
docker builder prune -f --filter "until=24h" 2>/dev/null || true
docker container prune -f 2>/dev/null || true
docker image prune -f 2>/dev/null || true
docker image prune -a -f --filter "until=72h" 2>/dev/null || true
docker system df 2>/dev/null || true
docker compose ps 2>/dev/null || true

section "F5 project safe cleanup"
rm -rf client/coverage coverage .turbo .cache 2>/dev/null || true
BACKUPS_OLD=$(find backups -maxdepth 1 -type f -mtime +30 2>/dev/null | wc -l || echo 0)
find backups -maxdepth 1 -type f -mtime +30 -delete 2>/dev/null || true
echo "backups_removed_30d_plus=$BACKUPS_OLD"
# nginx access logs in project if large
if [ -d logs/nginx ]; then
  find logs/nginx -type f -name "*.log" -size +50M -mtime +7 -print 2>/dev/null | head -5 || true
  find logs/nginx -type f -name "*.log" -size +50M -mtime +7 -delete 2>/dev/null || true
fi

section "F6 after cleanup"
df -h
df -i
free -h
docker system df 2>/dev/null || true
docker compose ps 2>/dev/null || true
docker stats --no-stream 2>/dev/null || true
DISK_AFTER=$(df -h / | awk 'NR==2 {{print $5}}')
DISK_AVAIL_AFTER=$(df -h / | awk 'NR==2 {{print $4}}')
echo "DISK_USE_BEFORE=$DISK_BEFORE AVAIL_BEFORE=$DISK_AVAIL_BEFORE"
echo "DISK_USE_AFTER=$DISK_AFTER AVAIL_AFTER=$DISK_AVAIL_AFTER"

section "F7 services"
(docker compose logs --tail=40 app 2>&1 | grep -iE "error|fatal|timeout" | tail -15) || echo "(no recent app errors)"
docker compose exec -T redis redis-cli ping < /dev/null 2>/dev/null || echo "redis_ping_failed"
docker compose exec -T db pg_isready -U blockminer -d blockminer_db < /dev/null 2>/dev/null || echo "pg_not_ready"

bench_urls() {{
  for url in "$@"; do
    echo "==== $url"
    curl -sS -o /tmp/curl_body.txt -w "status=%{{http_code}} time_total=%{{time_total}} ttfb=%{{time_starttransfer}}\\n" "$url" 2>/dev/null || echo "status=000 time_total=0"
    head -c 400 /tmp/curl_body.txt 2>/dev/null; echo
  done
}}

section "F8 local no session"
bench_urls \\
  "http://127.0.0.1:3000/login" \\
  "http://127.0.0.1:3000/api/auth/session" \\
  "http://127.0.0.1:3000/api/wallet/balance" \\
  "http://127.0.0.1:3000/api/stats/power" \\
  "http://127.0.0.1:3000/api/checkin/status" \\
  "http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling"

section "F8 public no session"
bench_urls \\
  "https://blockminer.space/login" \\
  "https://blockminer.space/api/auth/session" \\
  "https://blockminer.space/api/wallet/balance" \\
  "https://blockminer.space/api/stats/power" \\
  "https://blockminer.space/api/checkin/status" \\
  "https://blockminer.space/socket.io/?EIO=4&transport=polling"

{login_block}

section "F10 postgres"
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select count(*) from pg_stat_activity;" < /dev/null 2>/dev/null || true
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select state, count(*) from pg_stat_activity group by state;" < /dev/null 2>/dev/null || true

section "F11 redis"
docker compose exec -T redis redis-cli info clients < /dev/null 2>/dev/null | head -6 || true
docker compose exec -T redis redis-cli info memory < /dev/null 2>/dev/null | grep used_memory_human || true
docker compose exec -T redis redis-cli slowlog get 5 < /dev/null 2>/dev/null || true

section "volumes intact"
docker volume ls 2>/dev/null | grep -E "block-miner|postgres" || true
echo "DONE"
"""
    print(f"[local] Connecting to {user}@{host} ...", flush=True)
    extra_env: dict[str, str] = {}
    if test_id and test_pw:
        extra_env["BLOCKMINER_TEST_IDENTIFIER"] = test_id
        extra_env["BLOCKMINER_TEST_PASSWORD"] = test_pw
    output = run_ssh_script(host, user, pw, script, timeout=900, extra_env=extra_env or None)
    print(output)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    section_body = f"""
{MARKER}

**Executado:** {ts}  
**App root:** `{APP_ROOT}`  
**Volumes/DB/uploads:** não foram apagados (`docker volume prune` e `down -v` **não** usados).

### Resumo operacional

| Item | Nota |
|------|------|
| Credenciais de teste para login autenticado | {"Definidas via `BLOCKMINER_TEST_IDENTIFIER` + `BLOCKMINER_TEST_PASSWORD` no operador" if test_id and test_pw else "**Não fornecidas** — medição com sessão real não executada; definir env e re-correr script"} |
| Secrets no relatório | Nenhum valor de senha/URL de DB impresso |

### Saída bruta do script (VM)

```
{output.strip()[:24000]}
```

*(Saída truncada se >24k chars; logs completos ficaram no terminal da execução.)*

### Classificação de latência

| Faixa | Critério |
|-------|----------|
| rápido | &lt; 300 ms |
| aceitável | 300 ms – 1 s |
| lento | 1 s – 3 s |
| crítico | &gt; 3 s |

### Próxima ação recomendada

1. Manter disco abaixo de 85% (repetir `docker builder prune` semanalmente se builds frequentes).
2. Fechar bind público da porta 5432 no firewall da VM.
3. Para medição **com sessão**: `BLOCKMINER_TEST_IDENTIFIER=email BLOCKMINER_TEST_PASSWORD=*** python3 scripts/vm-disk-cleanup-and-benchmark.py`
4. Se `/api/stats/power` &gt; 1s com sessão, considerar cache curto ou reduzir cap de ranking (já degradado em falha).

"""

    if REPORT_PATH.exists():
        text = REPORT_PATH.read_text(encoding="utf-8")
        if MARKER in text:
            text = text.split(MARKER)[0].rstrip() + "\n" + section_body
        else:
            text = text.rstrip() + "\n" + section_body
    else:
        text = "# BlockMiner runtime audit\n" + section_body
    REPORT_PATH.write_text(text, encoding="utf-8")
    print(f"\n[local] Updated {REPORT_PATH}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
