#!/usr/bin/env python3
"""
vm-patch-lockout-memory.py
--------------------------
Ativa AUTH_LOCKOUT_USE_MEMORY=1 e API_RATE_LIMIT_USE_MEMORY=1 no .env.production.

Por que: cada tentativa de login faz 2-4 transações Postgres com advisory locks
para o sistema de lockout. Sob carga isso esgota o pool de conexões e retorna
"servidor sobrecarregado" para usuários legítimos. Com essas flags o lockout fica
em memória (por container), eliminando as transações extras.

Efeito colateral aceitável: ao reiniciar o container, contadores de tentativas são
zerados. A proteção anti-brute-force ainda funciona — só perde estado no restart.
"""
from __future__ import annotations
import sys
import time

try:
    import paramiko
except ImportError:
    print("Instalando paramiko...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
    import paramiko

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
try:
    from vm_config import IP, LOGIN, ROOT_PASSWORD
except Exception as e:
    print(f"[ERRO] Não foi possível carregar vm_config: {e}")
    sys.exit(1)

ENV_FILE    = "/root/block-miner-v3/.env.production"
COMPOSE_DIR = "/root/block-miner-v3"

VARS = {
    "AUTH_LOCKOUT_USE_MEMORY":   "1",
    "API_RATE_LIMIT_USE_MEMORY": "1",
}


def run(client: paramiko.SSHClient, cmd: str, check: bool = True) -> str:
    print(f"  $ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(f"[stderr] {err.rstrip()}", file=sys.stderr)
    if check and stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(f"Comando falhou: {cmd}")
    return out


def patch_env(client: paramiko.SSHClient) -> None:
    print("\n── Aplicando variáveis de lockout em memória ────────────────────")
    for key, value in VARS.items():
        escaped = value.replace("\\", "\\\\").replace("/", "\\/").replace("&", "\\&")
        cmd = (
            f"grep -q '^{key}=' {ENV_FILE} "
            f"&& sed -i 's|^{key}=.*|{key}={escaped}|' {ENV_FILE} "
            f"|| echo '{key}={value}' >> {ENV_FILE}"
        )
        run(client, cmd)
        print(f"  ✓ {key}={value}")


def recreate_app(client: paramiko.SSHClient) -> None:
    print("\n── Recriando containers app e worker ────────────────────────────")
    run(client, f"cd {COMPOSE_DIR} && docker compose up -d --force-recreate app worker")
    print("  ✓ Containers recriados")


def main() -> None:
    print(f"Conectando à VM {IP}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=IP, username=LOGIN, password=ROOT_PASSWORD, timeout=30)
    print("  ✓ Conectado via SSH")

    try:
        run(client, f"test -f {ENV_FILE}")

        ts = int(time.time())
        run(client, f"cp {ENV_FILE} {ENV_FILE}.bak.{ts}")
        print(f"  ✓ Backup: {ENV_FILE}.bak.{ts}")

        patch_env(client)

        print("\n── Verificando vars no .env.production ──────────────────────────")
        run(client, f"grep -E '^AUTH_LOCKOUT|^API_RATE_LIMIT' {ENV_FILE}", check=False)

        recreate_app(client)

        print("\n  Aguardando 6s para containers iniciarem...")
        time.sleep(6)

        print("\n── Status dos containers ─────────────────────────────────────────")
        run(client, f"cd {COMPOSE_DIR} && docker compose ps --format 'table {{{{.Name}}}}\\t{{{{.Status}}}}'", check=False)

        print("\n✅ Lockout em memória ativado!")
        print("   Logins não vão mais gerar transações Postgres extras.")

    finally:
        client.close()


if __name__ == "__main__":
    main()
