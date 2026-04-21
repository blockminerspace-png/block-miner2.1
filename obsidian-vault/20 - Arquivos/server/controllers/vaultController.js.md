---
source_path: "server/controllers/vaultController.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 26240
modified_at: "2026-04-16T20:07:35.348Z"
outbound_local_refs: 12
inbound_local_refs: 1
---

# server/controllers/vaultController.js

## O que é

Orquestra request/response e chama serviços.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- Usa [[20 - Arquivos/server/models/minerProfileModel.js|server/models/minerProfileModel.js]]
- Usa [[20 - Arquivos/server/models/vaultModel.js|server/models/vaultModel.js]]
- Usa [[20 - Arquivos/server/services/distributedLockService.js|server/services/distributedLockService.js]]
- Usa [[20 - Arquivos/server/services/userOwnedMachineService.js|server/services/userOwnedMachineService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/utils/criticalMutationIdempotency.js|server/utils/criticalMutationIdempotency.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]
- Usa [[20 - Arquivos/server/utils/rackMinerRelease.js|server/utils/rackMinerRelease.js]]
- Usa [[20 - Arquivos/server/utils/securityErrors.js|server/utils/securityErrors.js]]
- Usa [[20 - Arquivos/server/utils/transactionLocks.js|server/utils/transactionLocks.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/routes/vault.js|server/routes/vault.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `26240 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
