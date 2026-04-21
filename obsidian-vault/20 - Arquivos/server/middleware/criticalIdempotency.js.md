---
source_path: "server/middleware/criticalIdempotency.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 1501
modified_at: "2026-04-13T21:32:30.000Z"
outbound_local_refs: 3
inbound_local_refs: 7
---

# server/middleware/criticalIdempotency.js

## O que é

Intercepta fluxo HTTP/socket para validação, segurança ou auditoria.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/utils/normalizeIdempotencyKey.js|server/utils/normalizeIdempotencyKey.js]]
- Usa [[20 - Arquivos/server/utils/securityErrors.js|server/utils/securityErrors.js]]
- Usa [[20 - Arquivos/server/utils/stableRequestHash.js|server/utils/stableRequestHash.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/routes/internal-offerwall.js|server/routes/internal-offerwall.js]]
- É usado por [[20 - Arquivos/server/routes/inventory.js|server/routes/inventory.js]]
- É usado por [[20 - Arquivos/server/routes/machines.js|server/routes/machines.js]]
- É usado por [[20 - Arquivos/server/routes/offer-events.js|server/routes/offer-events.js]]
- É usado por [[20 - Arquivos/server/routes/rooms.js|server/routes/rooms.js]]
- É usado por [[20 - Arquivos/server/routes/shop.js|server/routes/shop.js]]
- É usado por [[20 - Arquivos/server/routes/vault.js|server/routes/vault.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `1501 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
