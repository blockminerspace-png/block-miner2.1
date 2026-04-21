---
source_path: "server/routes/internal-offerwall.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 2552
modified_at: "2026-04-21T01:55:39.976Z"
outbound_local_refs: 7
inbound_local_refs: 1
---

# server/routes/internal-offerwall.js

## O que é

Define endpoints e entrada HTTP.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/internalOfferwallController.js|server/controllers/internalOfferwallController.js]]
- Usa [[20 - Arquivos/server/middleware/auth.js|server/middleware/auth.js]]
- Usa [[20 - Arquivos/server/middleware/criticalIdempotency.js|server/middleware/criticalIdempotency.js]]
- Usa [[20 - Arquivos/server/middleware/distributedRateLimit.js|server/middleware/distributedRateLimit.js]]
- Usa [[20 - Arquivos/server/middleware/sidebarFeatureGate.js|server/middleware/sidebarFeatureGate.js]]
- Usa [[20 - Arquivos/server/services/sidebarNavRegistry.js|server/services/sidebarNavRegistry.js]]
- Usa [[20 - Arquivos/server/utils/clientIp.js|server/utils/clientIp.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/server.js|server/server.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `2552 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
