---
source_path: "server/models/walletModel.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 10678
modified_at: "2026-04-21T01:54:26.340Z"
outbound_local_refs: 4
inbound_local_refs: 8
---

# server/models/walletModel.js

## O que é

Camada de acesso e modelagem de dados.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- Usa [[20 - Arquivos/server/services/withdrawalTelegramService.js|server/services/withdrawalTelegramService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/runtime/miningRuntime.js|server/src/runtime/miningRuntime.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/adminController.js|server/controllers/adminController.js]]
- É usado por [[20 - Arquivos/server/controllers/walletController.js|server/controllers/walletController.js]]
- É usado por [[20 - Arquivos/server/cron/depositsCron.js|server/cron/depositsCron.js]]
- É usado por [[20 - Arquivos/server/cron/withdrawalsCron.js|server/cron/withdrawalsCron.js]]
- É usado por [[20 - Arquivos/server/routes/admin.js|server/routes/admin.js]]
- É usado por [[20 - Arquivos/server/src/wallet/autoWithdraw.js|server/src/wallet/autoWithdraw.js]]
- É usado por [[20 - Arquivos/tests/walletDeposit.test.js|tests/walletDeposit.test.js]]
- É usado por [[20 - Arquivos/tests/walletWithdraw.test.js|tests/walletWithdraw.test.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `10678 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
