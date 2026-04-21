---
source_path: "server/services/internalOfferwall/internalOfferwallService.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 30519
modified_at: "2026-04-13T22:37:36.000Z"
outbound_local_refs: 18
inbound_local_refs: 2
---

# server/services/internalOfferwall/internalOfferwallService.js

## O que é

Implementa regra de negócio e integrações.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/models/minerProfileModel.js|server/models/minerProfileModel.js]]
- Usa [[20 - Arquivos/server/services/dailyTasks/dailyTaskConstants.js|server/services/dailyTasks/dailyTaskConstants.js]]
- Usa [[20 - Arquivos/server/services/dailyTasks/dailyTaskPeriod.js|server/services/dailyTasks/dailyTaskPeriod.js]]
- Usa [[20 - Arquivos/server/services/dailyTasks/dailyTaskProgressService.js|server/services/dailyTasks/dailyTaskProgressService.js]]
- Usa [[20 - Arquivos/server/services/distributedLockService.js|server/services/distributedLockService.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/buildUserAuditSnapshot.js|server/services/internalOfferwall/buildUserAuditSnapshot.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/grantInternalOfferwallReward.js|server/services/internalOfferwall/grantInternalOfferwallReward.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/iframeHostAllowlistCache.js|server/services/internalOfferwall/iframeHostAllowlistCache.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallCompletionWebhook.js|server/services/internalOfferwall/internalOfferwallCompletionWebhook.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallConstants.js|server/services/internalOfferwall/internalOfferwallConstants.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallFeature.js|server/services/internalOfferwall/internalOfferwallFeature.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallLimitState.js|server/services/internalOfferwall/internalOfferwallLimitState.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallMinView.js|server/services/internalOfferwall/internalOfferwallMinView.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallTaskMetadata.js|server/services/internalOfferwall/internalOfferwallTaskMetadata.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/validateIframeUrl.js|server/services/internalOfferwall/validateIframeUrl.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/db/prismaNamespace.js|server/src/db/prismaNamespace.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/adminInternalOfferwallController.js|server/controllers/adminInternalOfferwallController.js]]
- É usado por [[20 - Arquivos/server/controllers/internalOfferwallController.js|server/controllers/internalOfferwallController.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `30519 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
