# BlockMiner 2.1

Simulação de mineração Web3 — monólito modular TypeScript (Express + React + Prisma + Socket.IO).

**Produção:** https://blockminer.space

## Quick start

```bash
npm install
npm run build:server && npm run build:backend && npm run build:client:local
docker compose up -d
```

## Documentação

| Doc | Conteúdo |
|-----|----------|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | Arquitetura completa |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy VPS |
| [docs/MONITORING.md](docs/MONITORING.md) | Prometheus + Grafana |
| [docs/PRODUCTION.md](docs/PRODUCTION.md) | Checklist produção |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Operação diária |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Resolução de problemas |
| [docs/RELATORIO_FASE7_FINAL.md](docs/RELATORIO_FASE7_FINAL.md) | Relatório release final |

## Monitorização

- App: `GET /metrics`, `GET /health/ready`
- Stack: `docker compose -f docker-compose.observability.yml up -d`
- Admin: `/admin/metrics` (painel ops interno)

## Scripts

```bash
npm run dev          # desenvolvimento
npm run test         # testes
npm run observability:config  # validar compose observability
python3 scripts/vm-deploy-local-over-ssh.py  # deploy produção
```
