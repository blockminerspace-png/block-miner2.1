---
source_path: "server/controllers/inventoryController.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 9897
modified_at: "2026-04-13T21:32:30.000Z"
outbound_local_refs: 11
inbound_local_refs: 1
---

# server/controllers/inventoryController.js

## O que é

Orquestra request/response e chama serviços.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- Usa [[20 - Arquivos/server/models/inventoryModel.js|server/models/inventoryModel.js]]
- Usa [[20 - Arquivos/server/models/minerProfileModel.js|server/models/minerProfileModel.js]]
- Usa [[20 - Arquivos/server/services/distributedLockService.js|server/services/distributedLockService.js]]
- Usa [[20 - Arquivos/server/services/userOwnedMachineService.js|server/services/userOwnedMachineService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/utils/criticalMutationIdempotency.js|server/utils/criticalMutationIdempotency.js]]
- Usa [[20 - Arquivos/server/utils/rackMinerRelease.js|server/utils/rackMinerRelease.js]]
- Usa [[20 - Arquivos/server/utils/securityErrors.js|server/utils/securityErrors.js]]
- Usa [[20 - Arquivos/server/utils/transactionLocks.js|server/utils/transactionLocks.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/routes/inventory.js|server/routes/inventory.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `9897 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
