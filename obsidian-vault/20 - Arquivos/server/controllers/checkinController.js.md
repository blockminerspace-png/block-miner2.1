---
source_path: "server/controllers/checkinController.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 25157
modified_at: "2026-04-20T20:58:46.997Z"
outbound_local_refs: 13
inbound_local_refs: 5
---

# server/controllers/checkinController.js

## O que é

Orquestra request/response e chama serviços.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/services/checkinChain.js|server/services/checkinChain.js]]
- Usa [[20 - Arquivos/server/services/checkinMilestoneService.js|server/services/checkinMilestoneService.js]]
- Usa [[20 - Arquivos/server/services/dailyTasks/dailyTaskHookService.js|server/services/dailyTasks/dailyTaskHookService.js]]
- Usa [[20 - Arquivos/server/services/distributedLockService.js|server/services/distributedLockService.js]]
- Usa [[20 - Arquivos/server/services/miniPass/miniPassMissionHookService.js|server/services/miniPass/miniPassMissionHookService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/db/prismaNamespace.js|server/src/db/prismaNamespace.js]]
- Usa [[20 - Arquivos/server/src/runtime/miningRuntime.js|server/src/runtime/miningRuntime.js]]
- Usa [[20 - Arquivos/server/utils/checkinDate.js|server/utils/checkinDate.js]]
- Usa [[20 - Arquivos/server/utils/checkinStreak.js|server/utils/checkinStreak.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]
- Usa [[20 - Arquivos/server/utils/securityLogger.js|server/utils/securityLogger.js]]
- Usa [[20 - Arquivos/server/utils/transactionLocks.js|server/utils/transactionLocks.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/cron/checkinPendingCron.js|server/cron/checkinPendingCron.js]]
- É usado por [[20 - Arquivos/server/routes/checkin.js|server/routes/checkin.js]]
- É usado por [[20 - Arquivos/tests/checkinBalanceGate.test.js|tests/checkinBalanceGate.test.js]]
- É usado por [[20 - Arquivos/tests/checkinPaymentEnforcement.test.mjs|tests/checkinPaymentEnforcement.test.mjs]]
- É usado por [[20 - Arquivos/tests/checkinReceiverResolve.test.js|tests/checkinReceiverResolve.test.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `25157 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
