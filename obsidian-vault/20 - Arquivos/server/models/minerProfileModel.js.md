---
source_path: "server/models/minerProfileModel.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 5982
modified_at: "2026-04-13T17:35:38.000Z"
outbound_local_refs: 3
inbound_local_refs: 17
---

# server/models/minerProfileModel.js

## O que é

Camada de acesso e modelagem de dados.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/services/autoMiningV2/autoMiningV2DbAvailability.js|server/services/autoMiningV2/autoMiningV2DbAvailability.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/utils/transactionLocks.js|server/utils/transactionLocks.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/autoMiningGpuController.js|server/controllers/autoMiningGpuController.js]]
- É usado por [[20 - Arquivos/server/controllers/autoMiningV2Controller.js|server/controllers/autoMiningV2Controller.js]]
- É usado por [[20 - Arquivos/server/controllers/inventoryController.js|server/controllers/inventoryController.js]]
- É usado por [[20 - Arquivos/server/controllers/machinesController.js|server/controllers/machinesController.js]]
- É usado por [[20 - Arquivos/server/controllers/miningController.js|server/controllers/miningController.js]]
- É usado por [[20 - Arquivos/server/controllers/roomsController.js|server/controllers/roomsController.js]]
- É usado por [[20 - Arquivos/server/controllers/vaultController.js|server/controllers/vaultController.js]]
- É usado por [[20 - Arquivos/server/controllers/youtubeController.js|server/controllers/youtubeController.js]]
- É usado por [[20 - Arquivos/server/server.js|server/server.js]]
- É usado por [[20 - Arquivos/server/services/blkRewardDistributionService.js|server/services/blkRewardDistributionService.js]]
- É usado por [[20 - Arquivos/server/services/checkinMilestoneService.js|server/services/checkinMilestoneService.js]]
- É usado por [[20 - Arquivos/server/services/game2048Service.js|server/services/game2048Service.js]]
- É usado por [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallService.js|server/services/internalOfferwall/internalOfferwallService.js]]
- É usado por [[20 - Arquivos/server/services/miniPass/miniPassRewardFulfillmentService.js|server/services/miniPass/miniPassRewardFulfillmentService.js]]
- É usado por [[20 - Arquivos/server/services/readEarnService.js|server/services/readEarnService.js]]
- É usado por [[20 - Arquivos/server/src/socket/registerGamesSocketHandlers.js|server/src/socket/registerGamesSocketHandlers.js]]
- É usado por [[20 - Arquivos/tests/rooms.test.js|tests/rooms.test.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `5982 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
