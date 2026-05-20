#!/usr/bin/env python3
"""Patch VM .env.production + upload nginx/compose/runtime files + rebuild app."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import paramiko

REPO = Path(__file__).resolve().parent.parent
SECRET = REPO / "scripts" / "vm_config_secret.py"
APP_ROOT = "/root/block-miner-v3"

ENV_UPSERT = {
    "PG_POOL_MAX": "40",
    "PG_POOL_CONNECTION_TIMEOUT_MS": "30000",
    "PG_POOL_IDLE_MS": "45000",
    "WORKER_PG_POOL_MAX": "12",
    "AUTH_LOCKOUT_USE_MEMORY": "1",
    "API_RATE_LIMIT_USE_MEMORY": "1",
    "VITE_API_TIMEOUT_MS": "60000",
    "SOCKET_PING_INTERVAL_MS": "30000",
    "SOCKET_PING_TIMEOUT_MS": "180000",
    "SOCKET_CONNECT_TIMEOUT_MS": "120000",
    "SOCKET_MAX_HTTP_BUFFER_SIZE": "1048576",
    "VITE_SOCKET_TIMEOUT_MS": "180000",
    "SERVER_REQUEST_TIMEOUT_MS": "120000",
    "SERVER_HEADERS_TIMEOUT_MS": "125000",
    "SERVER_KEEPALIVE_TIMEOUT_MS": "70000",
}

UPLOADS = [
    ("nginx/nginx.conf", f"{APP_ROOT}/nginx/nginx.conf"),
    ("docker-compose.yml", f"{APP_ROOT}/docker-compose.yml"),
    ("Dockerfile", f"{APP_ROOT}/Dockerfile"),
    ("server/utils/runtimeTimeouts.ts", f"{APP_ROOT}/server/utils/runtimeTimeouts.ts"),
    ("server/utils/prismaHttpErrors.ts", f"{APP_ROOT}/server/utils/prismaHttpErrors.ts"),
    ("server/utils/securityStoreMode.ts", f"{APP_ROOT}/server/utils/securityStoreMode.ts"),
    ("server/server.ts", f"{APP_ROOT}/server/server.ts"),
    ("server/middleware/auth.ts", f"{APP_ROOT}/server/middleware/auth.ts"),
    ("server/services/accountLockoutService.ts", f"{APP_ROOT}/server/services/accountLockoutService.ts"),
    ("server/modules/auth/login/login.controller.ts", f"{APP_ROOT}/server/modules/auth/login/login.controller.ts"),
    ("server/modules/auth/session/session.controller.ts", f"{APP_ROOT}/server/modules/auth/session/session.controller.ts"),
    ("server/modules/auth/register/register.controller.ts", f"{APP_ROOT}/server/modules/auth/register/register.controller.ts"),
    ("server/modules/auth/shared/auth.prisma.ts", f"{APP_ROOT}/server/modules/auth/shared/auth.prisma.ts"),
    ("server/cron/miningCron.ts", f"{APP_ROOT}/server/cron/miningCron.ts"),
    ("server/middleware/httpRequestLogger.ts", f"{APP_ROOT}/server/middleware/httpRequestLogger.ts"),
    ("server/services/redisClient.ts", f"{APP_ROOT}/server/services/redisClient.ts"),
    ("server/jobs/bullmqRedis.ts", f"{APP_ROOT}/server/jobs/bullmqRedis.ts"),
    ("server/modules/stats/stats.controller.ts", f"{APP_ROOT}/server/modules/stats/stats.controller.ts"),
    ("tests/runtime/runtimeHealth.test.mjs", f"{APP_ROOT}/tests/runtime/runtimeHealth.test.mjs"),
    ("RUNTIME_PERFORMANCE_AND_TIMEOUT_AUDIT.md", f"{APP_ROOT}/RUNTIME_PERFORMANCE_AND_TIMEOUT_AUDIT.md"),
    ("client/src/store/auth.ts", f"{APP_ROOT}/client/src/store/auth.ts"),
    ("client/src/store/game.ts", f"{APP_ROOT}/client/src/store/game.ts"),
    ("client/src/shared/utils/apiTimeout.ts", f"{APP_ROOT}/client/src/shared/utils/apiTimeout.ts"),
    ("client/src/pages/auth/login/login.api.ts", f"{APP_ROOT}/client/src/pages/auth/login/login.api.ts"),
    ("client/src/pages/auth/login/LoginPage.tsx", f"{APP_ROOT}/client/src/pages/auth/login/LoginPage.tsx"),
    ("client/src/pages/auth/shared/auth.errors.ts", f"{APP_ROOT}/client/src/pages/auth/shared/auth.errors.ts"),
    ("client/src/i18n/locales/pt-BR.json", f"{APP_ROOT}/client/src/i18n/locales/pt-BR.json"),
    ("client/src/i18n/locales/en.json", f"{APP_ROOT}/client/src/i18n/locales/en.json"),
    ("client/src/i18n/locales/es.json", f"{APP_ROOT}/client/src/i18n/locales/es.json"),
]


def load_secret() -> tuple[str, str, str]:
    spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return str(mod.IP), str(mod.LOGIN), str(mod.ROOT_PASSWORD)


def upsert_env_remote(sftp: paramiko.SFTPClient, env_path: str) -> None:
    try:
        with sftp.open(env_path, "r") as f:
            lines = f.read().decode("utf-8", errors="replace").splitlines()
    except OSError:
        lines = []
    keys = set(ENV_UPSERT)
    out: list[str] = []
    seen: set[str] = set()
    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            k = line.split("=", 1)[0].strip()
            if k in keys:
                if k not in seen:
                    out.append(f"{k}={ENV_UPSERT[k]}")
                    seen.add(k)
                continue
        out.append(line)
    for k, v in ENV_UPSERT.items():
        if k not in seen:
            out.append(f"{k}={v}")
    data = "\n".join(out).rstrip() + "\n"
    with sftp.open(env_path, "w") as f:
        f.write(data.encode("utf-8"))


def main() -> int:
    host, user, password = load_secret()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=120, look_for_keys=False, allow_agent=False)
    sftp = client.open_sftp()
    upsert_env_remote(sftp, f"{APP_ROOT}/.env.production")
    print("[vm] .env.production updated (pool + socket + server timeouts)")
    for local_rel, remote in UPLOADS:
        local = REPO / local_rel
        sftp.put(str(local), remote)
        print(f"[vm] uploaded {local_rel}")
    sftp.close()
    cmd = (
        f"cd {APP_ROOT} && "
        "docker compose build app worker && "
        "docker compose up -d app worker nginx && "
        "docker compose exec -T nginx nginx -s reload 2>/dev/null || true && "
        "curl -sS -o /dev/null -w 'health:%{http_code}\\n' http://127.0.0.1:3000/health || true"
    )
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=False)
    stdin.close()
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.buffer.write(stdout.channel.recv(65536))
            sys.stdout.flush()
        if stdout.channel.recv_stderr_ready():
            sys.stderr.buffer.write(stdout.channel.recv_stderr(65536))
            sys.stderr.flush()
        if stdout.channel.exit_status_ready():
            break
    code = stdout.channel.recv_exit_status()
    client.close()
    return int(code)


if __name__ == "__main__":
    raise SystemExit(main())
