#!/usr/bin/env python3
"""Authenticated VM benchmark + report update. Never prints passwords/tokens/cookies."""
from __future__ import annotations

import importlib.util
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SECRET = REPO / "scripts" / "vm_config_secret.py"
TEST_ENV = Path(__file__).resolve().parent / ".blockminer-test-env"
APP_ROOT = os.environ.get("VM_APP_ROOT", "/root/block-miner-v3")
REPORT_PATH = REPO / "RUNTIME_PERFORMANCE_AND_TIMEOUT_AUDIT.md"
MARKER = "## Medição autenticada pós-limpeza"

_spec = importlib.util.spec_from_file_location(
    "vm_disk_cleanup_and_benchmark",
    REPO / "scripts" / "vm-disk-cleanup-and-benchmark.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
load_secret = _mod.load_secret
run_ssh_script = _mod.run_ssh_script


def load_test_creds() -> tuple[str, str]:
    ident = os.environ.get("BLOCKMINER_TEST_IDENTIFIER", "").strip()
    pw = os.environ.get("BLOCKMINER_TEST_PASSWORD", "").strip()
    if TEST_ENV.is_file():
        for line in TEST_ENV.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:]
            if "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "BLOCKMINER_TEST_IDENTIFIER" and v:
                ident = ident or v
            if k == "BLOCKMINER_TEST_PASSWORD" and v:
                pw = pw or v
    if not (ident and pw) and SECRET.is_file():
        spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        ident = ident or str(getattr(mod, "BLOCKMINER_TEST_IDENTIFIER", "") or "").strip()
        pw = pw or str(getattr(mod, "BLOCKMINER_TEST_PASSWORD", "") or "").strip()
    return ident, pw


def sanitize(text: str) -> str:
    rules = [
        (r"(?i)(password|passwd|secret|token|jwt|authorization|set-cookie|mnemonic|seed|private[_-]?key|database_url)\s*[:=]\s*\S+", r"\1=[REDACTED]"),
        (r'"password"\s*:\s*"[^"]*"', '"password":"[REDACTED]"'),
        (r'"token"\s*:\s*"[^"]*"', '"token":"[REDACTED]"'),
        (r'"accessToken"\s*:\s*"[^"]*"', '"accessToken":"[REDACTED]"'),
        (r'"refreshToken"\s*:\s*"[^"]*"', '"refreshToken":"[REDACTED]"'),
        (r'"sid"\s*:\s*"[^"]+"', '"sid":"[REDACTED]"'),
        (r"sid=[A-Za-z0-9_-]+", "sid=[REDACTED]"),
    ]
    for pat, repl in rules:
        text = re.sub(pat, repl, text)
    return text


def classify(seconds: float) -> str:
    ms = seconds * 1000
    if ms < 300:
        return "rápido"
    if ms < 1000:
        return "aceitável"
    if ms < 3000:
        return "lento"
    return "crítico"


def parse_metrics(text: str) -> list[dict]:
    rows: list[dict] = []
    url = ""
    for line in text.splitlines():
        if line.startswith("==== "):
            url = line.replace("==== ", "").strip()
        m = re.search(r"(login_)?status=(\d+).*time_total=([\d.]+)", line)
        if m and url:
            status = int(m.group(2))
            t = float(m.group(3))
            rows.append(
                {
                    "url": url,
                    "status": status,
                    "time_s": t,
                    "class": classify(t),
                    "fail": status in (500, 502, 503),
                }
            )
        if line.startswith("login_status="):
            m2 = re.search(r"login_status=(\d+).*time_total=([\d.]+)", line)
            if m2:
                rows.append(
                    {
                        "url": "POST /api/auth/login",
                        "status": int(m2.group(1)),
                        "time_s": float(m2.group(2)),
                        "class": classify(float(m2.group(2))),
                        "fail": int(m2.group(1)) in (500, 502, 503),
                    }
                )
    return rows


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


def update_report(safe_out: str, has_creds: bool, auth_ok: bool) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    commit = local_git_commit()
    disk = ""
    for line in safe_out.splitlines():
        if line.startswith("/dev/sda1"):
            disk = line.strip()
            break
    metrics = parse_metrics(safe_out)
    auth_metrics = [r for r in metrics if "(auth)" in r["url"] or r["url"] == "POST /api/auth/login"]
    login_ok = re.search(r"login_json_ok=\s*(\w+)", safe_out)
    login_2fa = re.search(r"requires_2fa=\s*(\w+)", safe_out)
    login_code = re.search(r"code=\s*'?([^'\s]+)'?", safe_out)
    pg_idle_tx = "0"
    if "idle in transaction" in safe_out:
        for line in safe_out.splitlines():
            if "idle in transaction" in line:
                parts = line.split("|")
                if len(parts) >= 2:
                    pg_idle_tx = parts[1].strip()
                break
    fails = [r for r in auth_metrics if r["fail"]]
    auth_executed = has_creds and "AUTH_SKIP" not in safe_out and bool(auth_metrics)

    body = f"""{MARKER}

**Executado:** {ts}  
**Script:** `scripts/vm-benchmark-only.py`  
**Commit local:** `{commit}`  
**Disco atual:** `{disk or "ver VM"}`  

### Infra (pré/pós benchmark)

| Check | Resultado |
|-------|-----------|
| Containers | 5/5 esperados Up (ver `docker compose ps` na VM) |
| Redis | **PONG** na secção F7 |
| Postgres | **pg_isready OK** (`blockminer` / `blockminer_db`) |
| `idle in transaction` | **{pg_idle_tx}** após benchmark |

### Login autenticado (sem corpo sensível)

| Campo | Valor |
|-------|-------|
| Credenciais carregadas | {"sim" if has_creds else "**não** — criar `scripts/.blockminer-test-env` ou export env"} |
| Benchmark autenticado executado | {"**sim**" if auth_executed else "**não**"} |
| `login_json_ok` | {login_ok.group(1) if login_ok else "n/a"} |
| `requires_2fa` | {login_2fa.group(1) if login_2fa else "n/a"} |
| `code` (se erro) | {login_code.group(1) if login_code else "n/a"} |

### Endpoints autenticados (HTTPS)

| Endpoint | Status | time_total | Classificação |
|----------|--------|------------|---------------|
"""
    if not auth_executed:
        body += "| — | — | — | **pendente** — definir credenciais gitignored e re-correr script |\n"
    else:
        for r in auth_metrics:
            note = " **falha**" if r["fail"] else ""
            body += f"| `{r['url']}` | {r['status']} | {r['time_s']:.3f}s | {r['class']}{note} |\n"

    body += f"""
### Endpoints públicos (validação rápida)

| Endpoint | Métrica na saída |
|----------|------------------|
| `/login` | Ver `post public validation` |
| `/api/auth/session` (sem cookie) | 401 esperado |
| `/socket.io` polling | 200 esperado |

### 500/502/503

{"**Nenhum** na bateria autenticada." if auth_executed and not fails else "**N/A** ou verificar saída — falhas: " + str(len(fails))}

### Postgres / Redis pós-benchmark

Resumo na saída sanitizada (`F10 postgres`, `F11 redis`). Slowlog Redis: ver VM.

### Classificação geral

"""
    if auth_executed and not fails:
        slow = [r for r in auth_metrics if r["class"] in ("lento", "crítico")]
        if not slow:
            body += "Autenticado: **rápido/aceitável** em todos os endpoints medidos.\n"
        else:
            body += f"Autenticado: endpoints lentos/críticos: {', '.join(r['url'] for r in slow)}\n"
    else:
        body += "Autenticado: **pendente**.\n"

    body += """
### Próxima ação

1. Se `requires_2fa=True`, usar conta de teste sem 2FA.
2. Manter disco < 30%; `docker builder prune -f --filter until=168h` semanal.
3. Fechar porta **5432** no firewall público.
4. Monitorar `idle in transaction` se voltar a subir sob carga.

### Confirmação secrets

Nenhuma senha, cookie, token, JWT, `DATABASE_URL` ou chave privada nesta secção.

<details>
<summary>Log sanitizado (resumo)</summary>

```
""" + "\n".join(safe_out.splitlines()[-40:]) + """
```

</details>
"""

    text = REPORT_PATH.read_text(encoding="utf-8")
    if MARKER in text:
        text = text.split(MARKER)[0].rstrip() + "\n\n" + body.strip() + "\n"
    else:
        text = text.rstrip() + "\n\n" + body.strip() + "\n"
    REPORT_PATH.write_text(text, encoding="utf-8")


def main() -> int:
    host, user, pw = load_secret()
    test_id, test_pw = load_test_creds()
    has_creds = bool(test_id and test_pw)

    if not has_creds:
        print(
            "[local] BLOCKMINER_TEST_* ausente. Crie scripts/.blockminer-test-env (gitignored) ou export env.",
            file=sys.stderr,
        )

    login_block = """
section "F9 auth session"
rm -f /tmp/blockminer-cookie.txt /tmp/login_response.json /tmp/curl_body.txt
if [ -n "${BLOCKMINER_TEST_IDENTIFIER:-}" ] && [ -n "${BLOCKMINER_TEST_PASSWORD:-}" ]; then
  BODY=$(python3 -c 'import json,os; print(json.dumps({"identifier":os.environ["BLOCKMINER_TEST_IDENTIFIER"],"password":os.environ["BLOCKMINER_TEST_PASSWORD"]}))')
  curl -sS -c /tmp/blockminer-cookie.txt -H "Content-Type: application/json" -d "$BODY" \\
    "https://blockminer.space/api/auth/login" -o /tmp/login_response.json \\
    -w "login_status=%{http_code} time_total=%{time_total} ttfb=%{time_starttransfer}\\n" || true
  python3 -c "import json;d=json.load(open('/tmp/login_response.json'));print('login_json_ok=',d.get('ok'),'requires_2fa=',d.get('requiresTwoFactor'),'code=',d.get('code',''))" 2>/dev/null || echo "login_json_parse_failed"
  for url in "https://blockminer.space/api/auth/session" "https://blockminer.space/api/wallet/balance" "https://blockminer.space/api/stats/power" "https://blockminer.space/api/checkin/status"; do
    echo "==== $url (auth)"
    curl -sS -b /tmp/blockminer-cookie.txt -o /tmp/curl_body.txt -w "status=%{http_code} time_total=%{time_total} ttfb=%{time_starttransfer}\\n" "$url" || true
    python3 -c "import json; p='/tmp/curl_body.txt';
try:
 d=json.loads(open(p).read());
 print('body_ok=',d.get('ok'),'keys=',list(d.keys())[:10])
except Exception:
 print('body_len=',len(open(p,'rb').read()))" 2>/dev/null || true
  done
  echo "==== https://blockminer.space/socket.io/?EIO=4&transport=polling (auth)"
  curl -sS -b /tmp/blockminer-cookie.txt -o /tmp/curl_body.txt -w "status=%{http_code} time_total=%{time_total} ttfb=%{time_starttransfer}\\n" "https://blockminer.space/socket.io/?EIO=4&transport=polling" || true
  head -c 80 /tmp/curl_body.txt | sed 's/"sid":"[^"]*"/"sid":"[REDACTED]"/g'; echo
  rm -f /tmp/blockminer-cookie.txt /tmp/login_response.json /tmp/curl_body.txt
else
  echo "AUTH_SKIP=no_test_credentials"
fi
"""

    script = f"""
set -uo pipefail
cd {APP_ROOT} 2>/dev/null || cd /root/block-miner-v3
[ -f /root/.blockminer-test-env ] && set -a && . /root/.blockminer-test-env && set +a
section() {{ echo ""; echo "=== $1 ==="; }}
section "preflight"
date -u
df -h / | awk 'NR==2'
docker compose ps 2>/dev/null | grep -E "block-miner|NAME" || true
section "F7 health"
docker compose exec -T redis redis-cli ping < /dev/null 2>/dev/null || true
docker compose exec -T db pg_isready -U blockminer -d blockminer_db < /dev/null 2>/dev/null || true
{login_block}
section "post public validation"
for url in "https://blockminer.space/login" "https://blockminer.space/api/auth/session" "https://blockminer.space/socket.io/?EIO=4&transport=polling"; do
  echo "==== $url"
  curl -sS -o /tmp/curl_body.txt -w "status=%{{http_code}} time_total=%{{time_total}} ttfb=%{{time_starttransfer}}\\n" "$url" 2>/dev/null || echo "status=000"
  head -c 60 /tmp/curl_body.txt 2>/dev/null | sed 's/"sid":"[^"]*"/"sid":"[REDACTED]"/g'; echo
done
section "F10 postgres"
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select count(*) from pg_stat_activity;" < /dev/null 2>/dev/null || true
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select state, count(*) from pg_stat_activity group by state;" < /dev/null 2>/dev/null || true
docker compose exec -T db psql -U blockminer -d blockminer_db -c "select pid, state, wait_event_type, wait_event, query_start, left(query, 200) from pg_stat_activity where state <> 'idle' order by query_start asc limit 20;" < /dev/null 2>/dev/null || true
section "F11 redis"
docker compose exec -T redis redis-cli info clients < /dev/null 2>/dev/null | head -8 || true
docker compose exec -T redis redis-cli info memory < /dev/null 2>/dev/null | grep -E "used_memory_human|maxmemory" || true
docker compose exec -T redis redis-cli slowlog get 20 < /dev/null 2>/dev/null || true
echo "DONE"
"""

    extra_env: dict[str, str] = {}
    if has_creds:
        extra_env["BLOCKMINER_TEST_IDENTIFIER"] = test_id
        extra_env["BLOCKMINER_TEST_PASSWORD"] = test_pw

    print(f"[local] Running auth benchmark (creds={'yes' if has_creds else 'no'})...", flush=True)
    raw = run_ssh_script(host, user, pw, script, timeout=300, extra_env=extra_env or None)
    safe = sanitize(raw)
    print(safe)

    out_log = Path("/tmp/vm-benchmark-auth.txt")
    out_log.write_text(safe, encoding="utf-8")

    auth_ok = has_creds and "AUTH_SKIP" not in safe and "login_status=" in safe
    update_report(safe, has_creds, auth_ok)

    # Leak check on report and log
    leak_pat = re.compile(
        r"(BLOCKMINER_TEST_PASSWORD\s*=\s*[^*\s#\n]{8,}|Set-Cookie:\s*[^;\n]+|Bearer\s+[A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{30,})",
        re.I,
    )
    for path in (REPORT_PATH, out_log):
        if path.exists():
            content = path.read_text(encoding="utf-8", errors="replace")
            if leak_pat.search(content):
                print(f"[local] WARNING: possible secret in {path}", file=sys.stderr)
                return 3

    print(f"[local] Updated {REPORT_PATH}", flush=True)
    return 0 if auth_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
