---
source_path: "server/controllers/roomsController.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 17230
modified_at: "2026-04-20T20:46:04.233Z"
outbound_local_refs: 10
inbound_local_refs: 2
---

# server/controllers/roomsController.js

## O que é

Orquestra request/response e chama serviços.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- Usa [[20 - Arquivos/server/models/minerProfileModel.js|server/models/minerProfileModel.js]]
- Usa [[20 - Arquivos/server/services/distributedLockService.js|server/services/distributedLockService.js]]
- Usa [[20 - Arquivos/server/services/userOwnedMachineService.js|server/services/userOwnedMachineService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/src/runtime/miningRuntime.js|server/src/runtime/miningRuntime.js]]
- Usa [[20 - Arquivos/server/utils/criticalMutationIdempotency.js|server/utils/criticalMutationIdempotency.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]
- Usa [[20 - Arquivos/server/utils/securityErrors.js|server/utils/securityErrors.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/routes/rooms.js|server/routes/rooms.js]]
- É usado por [[20 - Arquivos/tests/rooms.test.js|tests/rooms.test.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `17230 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
