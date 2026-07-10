# Grafana — BlockMiner

## Instalação

```bash
docker compose -f docker-compose.observability.yml up -d grafana
```

- URL: http://127.0.0.1:3030 (localhost)
- Credenciais: `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` (`.env.observability`)
- Provisioning automático — **sem configuração manual**

## Datasource

Criado automaticamente em `monitoring/grafana/provisioning/datasources/prometheus.yml`:

- Nome: **Prometheus**
- URL: `http://prometheus:9090`
- Default: sim

## Dashboards provisionados

Pasta: `monitoring/grafana/dashboards/` → UI folder **BlockMiner**

| Dashboard | UID | Conteúdo |
|-----------|-----|----------|
| Geral | `bm-general` | CPU, RAM, disco, rede, uptime, RPS, latência, 4xx/5xx |
| API | `bm-api` | Requests, P95/P99, rotas, erros |
| Socket.IO | `bm-socket` | Conexões, disconnects, mensagens |
| Economia | `bm-economy` | Mining, cron, claims por módulo |
| Banco & Filas | `bm-database` | Postgres, Redis, Prisma, BullMQ |
| Segurança | `bm-security` | 401/403/404/500/502, readiness |

## Painel administrativo interno

Além do Grafana, o admin in-app em **`/admin/metrics`** mostra:

- CPU/RAM/disco do host
- Snapshot ops (`GET /admin/ops/snapshot`): health, alertas, sockets, filas, economia

Atualização a cada 15s — sem bibliotecas pesadas.

## Adicionar dashboard

1. Editar ou criar JSON em `monitoring/grafana/dashboards/`
2. `docker compose -f docker-compose.observability.yml restart grafana`
3. Ou exportar do UI e commitar o JSON

## Backup Grafana

Volume Docker `grafana_data` — ver [`BACKUP.md`](../BACKUP.md).

## Segurança

- `GF_AUTH_ANONYMOUS_ENABLED=false`
- Porta bind localhost
- Acesso remoto via SSH: `ssh -L 3030:127.0.0.1:3030 user@vm`
