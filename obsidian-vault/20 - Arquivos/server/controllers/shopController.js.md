---
source_path: "server/controllers/shopController.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 7783
modified_at: "2026-04-13T21:32:30.000Z"
outbound_local_refs: 12
inbound_local_refs: 1
---

# server/controllers/shopController.js

## O que é

Orquestra request/response e chama serviços.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- Usa [[20 - Arquivos/server/models/minersModel.js|server/models/minersModel.js]]
- Usa [[20 - Arquivos/server/services/distributedLockService.js|server/services/distributedLockService.js]]
- Usa [[20 - Arquivos/server/services/idempotencyService.js|server/services/idempotencyService.js]]
- Usa [[20 - Arquivos/server/services/userOwnedMachineService.js|server/services/userOwnedMachineService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/src/runtime/miningRuntime.js|server/src/runtime/miningRuntime.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]
- Usa [[20 - Arquivos/server/utils/securityErrors.js|server/utils/securityErrors.js]]
- Usa [[20 - Arquivos/server/utils/securityLogger.js|server/utils/securityLogger.js]]
- Usa [[20 - Arquivos/server/utils/transactionLocks.js|server/utils/transactionLocks.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/routes/shop.js|server/routes/shop.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `7783 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
