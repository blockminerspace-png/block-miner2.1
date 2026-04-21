---
source_path: "server/controllers/walletController.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 20305
modified_at: "2026-04-21T03:24:56.675Z"
outbound_local_refs: 13
inbound_local_refs: 4
---

# server/controllers/walletController.js

## O que é

Orquestra request/response e chama serviços.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/cron/depositsCron.js|server/cron/depositsCron.js]]
- Usa [[20 - Arquivos/server/models/walletModel.js|server/models/walletModel.js]]
- Usa [[20 - Arquivos/server/services/btcpayService.js|server/services/btcpayService.js]]
- Usa [[20 - Arquivos/server/services/depositVerifier.js|server/services/depositVerifier.js]]
- Usa [[20 - Arquivos/server/services/polygonDepositConfig.js|server/services/polygonDepositConfig.js]]
- Usa [[20 - Arquivos/server/services/polygonHdConfig.js|server/services/polygonHdConfig.js]]
- Usa [[20 - Arquivos/server/services/polygonHdWallet.js|server/services/polygonHdWallet.js]]
- Usa [[20 - Arquivos/server/services/polygonProvider.js|server/services/polygonProvider.js]]
- Usa [[20 - Arquivos/server/services/withdrawalTelegramService.js|server/services/withdrawalTelegramService.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/utils/cryptoPrice.js|server/utils/cryptoPrice.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/routes/wallet.js|server/routes/wallet.js]]
- É usado por [[20 - Arquivos/tests/walletDeposit.test.js|tests/walletDeposit.test.js]]
- É usado por [[20 - Arquivos/tests/walletValidation.test.js|tests/walletValidation.test.js]]
- É usado por [[20 - Arquivos/tests/walletWithdraw.test.js|tests/walletWithdraw.test.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `20305 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
