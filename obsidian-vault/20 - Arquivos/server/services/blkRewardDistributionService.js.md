---
source_path: "server/services/blkRewardDistributionService.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 8465
modified_at: "2026-04-10T23:27:44.000Z"
outbound_local_refs: 6
inbound_local_refs: 3
---

# server/services/blkRewardDistributionService.js

## O que é

Implementa regra de negócio e integrações.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/models/blkEconomyModel.js|server/models/blkEconomyModel.js]]
- Usa [[20 - Arquivos/server/models/minerProfileModel.js|server/models/minerProfileModel.js]]
- Usa [[20 - Arquivos/server/services/dailyTasks/dailyTaskHookService.js|server/services/dailyTasks/dailyTaskHookService.js]]
- Usa [[20 - Arquivos/server/services/miniPass/miniPassMissionHookService.js|server/services/miniPass/miniPassMissionHookService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/miningController.js|server/controllers/miningController.js]]
- É usado por [[20 - Arquivos/server/controllers/powerStatsController.js|server/controllers/powerStatsController.js]]
- É usado por [[20 - Arquivos/server/cron/blkRewardCycleCron.js|server/cron/blkRewardCycleCron.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `8465 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
