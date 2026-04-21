---
source_path: "server/services/streaming/streamRunner.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 12316
modified_at: "2026-04-12T16:38:37.000Z"
outbound_local_refs: 6
inbound_local_refs: 3
---

# server/services/streaming/streamRunner.js

## O que é

Implementa regra de negócio e integrações.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/services/streaming/liveRtmpPipeline.js|server/services/streaming/liveRtmpPipeline.js]]
- Usa [[20 - Arquivos/server/services/streaming/streamEnvCheck.js|server/services/streaming/streamEnvCheck.js]]
- Usa [[20 - Arquivos/server/services/streaming/streamRestartPolicy.js|server/services/streaming/streamRestartPolicy.js]]
- Usa [[20 - Arquivos/server/services/streaming/youtubeStreamService.js|server/services/streaming/youtubeStreamService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/adminYoutubeStreamController.js|server/controllers/adminYoutubeStreamController.js]]
- É usado por [[20 - Arquivos/server/server.js|server/server.js]]
- É usado por [[20 - Arquivos/tests/streamRunner.pendingRestart.test.mjs|tests/streamRunner.pendingRestart.test.mjs]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `12316 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
