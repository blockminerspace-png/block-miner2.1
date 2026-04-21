---
source_path: "server/services/distributedLockService.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 512
modified_at: "2026-04-13T21:32:30.000Z"
outbound_local_refs: 1
inbound_local_refs: 8
---

# server/services/distributedLockService.js

## O que é

Implementa regra de negócio e integrações.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/utils/pgAdvisoryLocks.js|server/utils/pgAdvisoryLocks.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/checkinController.js|server/controllers/checkinController.js]]
- É usado por [[20 - Arquivos/server/controllers/inventoryController.js|server/controllers/inventoryController.js]]
- É usado por [[20 - Arquivos/server/controllers/machinesController.js|server/controllers/machinesController.js]]
- É usado por [[20 - Arquivos/server/controllers/roomsController.js|server/controllers/roomsController.js]]
- É usado por [[20 - Arquivos/server/controllers/shopController.js|server/controllers/shopController.js]]
- É usado por [[20 - Arquivos/server/controllers/vaultController.js|server/controllers/vaultController.js]]
- É usado por [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallService.js|server/services/internalOfferwall/internalOfferwallService.js]]
- É usado por [[20 - Arquivos/server/services/offerEventPurchaseService.js|server/services/offerEventPurchaseService.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `512 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
