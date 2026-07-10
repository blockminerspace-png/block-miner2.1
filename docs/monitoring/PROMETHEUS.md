# Prometheus — BlockMiner

Documentação da configuração Prometheus (Fase 6A/7). Exemplo funcional: [`prometheus.example.yml`](./prometheus.example.yml).

## Instalação

A stack oficial corre via Docker Compose overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d prometheus
```

Imagem: `prom/prometheus:v2.54.1` — porta **127.0.0.1:9090** (localhost apenas).

## Configuração

| Parâmetro | Valor |
|-----------|-------|
| `scrape_interval` | 15s |
| `scrape_timeout` | 10s |
| `evaluation_interval` | 15s |
| Retenção TSDB | 30 dias |

Ficheiro principal: `monitoring/prometheus/prometheus.yml`  
Regras de alerta: `monitoring/prometheus/alerts/*.yml`

## scrape_configs

| Job | Target | Métricas |
|-----|--------|----------|
| `blockminer` | `block-miner-app:3000/metrics` | App (HTTP, Socket, Prisma, BullMQ, mining) |
| `blockminer-readiness` | blackbox → `/health/ready` | Probe HTTP 200 |
| `node` | `node-exporter:9100` | CPU, RAM, disco, rede |
| `postgres` | `postgres-exporter:9187` | `pg_up`, conexões |
| `redis` | `redis-exporter:9121` | Redis stats |
| `prometheus` | `localhost:9090` | Self-monitoring |

## Labels

Todos os targets incluem:

- `job` — nome do scrape job
- `instance` — identificador do alvo
- `environment` — `production`
- `version` — `2.1`

## Métricas da aplicação (`blockminer_*`)

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `blockminer_http_requests_total` | counter | Requests por method/route/status |
| `blockminer_http_request_duration_ms` | histogram | Latência HTTP |
| `blockminer_http_errors_4xx_total` | counter | Erros 4xx |
| `blockminer_http_errors_5xx_total` | counter | Erros 5xx |
| `blockminer_socket_connections_active` | gauge | Conexões Socket.IO |
| `blockminer_socket_connects_total` | counter | Connects |
| `blockminer_socket_disconnects_total` | counter | Disconnects |
| `blockminer_prisma_queries_total` | counter | Queries Prisma |
| `blockminer_prisma_slow_queries_total` | counter | Queries > 1s |
| `blockminer_bullmq_jobs_*` | gauge | Filas BullMQ |
| `blockminer_mining_block_number` | gauge | Bloco atual |
| `blockminer_module_actions_total` | counter | Ações por módulo (economia) |
| `blockminer_process_uptime_seconds` | gauge | Uptime do processo |

## Boas práticas

1. Nunca expor `:9090` publicamente — SSH tunnel ou VPN.
2. Usar `/-/healthy` para healthcheck do container.
3. Após editar regras: `curl -X POST http://127.0.0.1:9090/-/reload` (lifecycle enabled).
4. Correlacionar alertas Prometheus com `/health/alerts` in-process e painel admin `/admin/metrics`.

Ver também: [`OBSERVABILITY_STACK.md`](../OBSERVABILITY_STACK.md), [`MONITORING.md`](../MONITORING.md).
