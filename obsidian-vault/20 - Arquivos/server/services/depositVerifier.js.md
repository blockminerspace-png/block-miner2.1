---
source_path: "server/services/depositVerifier.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 10984
modified_at: "2026-04-16T18:39:11.246Z"
outbound_local_refs: 9
inbound_local_refs: 4
---

# server/services/depositVerifier.js

## O que é

Implementa regra de negócio e integrações.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- Usa [[20 - Arquivos/server/services/contractDepositLog.js|server/services/contractDepositLog.js]]
- Usa [[20 - Arquivos/server/services/polygonDepositConfig.js|server/services/polygonDepositConfig.js]]
- Usa [[20 - Arquivos/server/services/polygonHdConfig.js|server/services/polygonHdConfig.js]]
- Usa [[20 - Arquivos/server/services/polygonProvider.js|server/services/polygonProvider.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/src/runtime/miningRuntime.js|server/src/runtime/miningRuntime.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/walletController.js|server/controllers/walletController.js]]
- É usado por [[20 - Arquivos/server/server.js|server/server.js]]
- É usado por [[20 - Arquivos/server/services/contractDepositSync.js|server/services/contractDepositSync.js]]
- É usado por [[20 - Arquivos/server/services/polygonHdDepositScanner.js|server/services/polygonHdDepositScanner.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `10984 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
