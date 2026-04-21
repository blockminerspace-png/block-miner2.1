---
source_path: "server/controllers/offerEventController.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 5381
modified_at: "2026-04-13T21:32:30.000Z"
outbound_local_refs: 6
inbound_local_refs: 2
---

# server/controllers/offerEventController.js

## O que é

Orquestra request/response e chama serviços.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/services/offerEventHelpers.js|server/services/offerEventHelpers.js]]
- Usa [[20 - Arquivos/server/services/offerEventPurchaseService.js|server/services/offerEventPurchaseService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/utils/criticalMutationIdempotency.js|server/utils/criticalMutationIdempotency.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]
- Usa [[20 - Arquivos/server/utils/securityErrors.js|server/utils/securityErrors.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/routes/offer-events.js|server/routes/offer-events.js]]
- É usado por [[20 - Arquivos/tests/offerEvents.publicList.test.mjs|tests/offerEvents.publicList.test.mjs]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `5381 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
