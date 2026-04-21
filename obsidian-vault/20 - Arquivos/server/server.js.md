---
source_path: "server/server.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 24434
modified_at: "2026-04-21T03:18:31.160Z"
outbound_local_refs: 73
inbound_local_refs: 0
---

# server/server.js

## O que é

Arquivo do projeto.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Ponto de montagem do backend; importa rotas, middlewares, engine e serviços-base.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/controllers/bannerController.js|server/controllers/bannerController.js]]
- Usa [[20 - Arquivos/server/controllers/btcpayWebhookController.js|server/controllers/btcpayWebhookController.js]]
- Usa [[20 - Arquivos/server/controllers/healthController.js|server/controllers/healthController.js]]
- Usa [[20 - Arquivos/server/controllers/publicLiveStatsController.js|server/controllers/publicLiveStatsController.js]]
- Usa [[20 - Arquivos/server/controllers/transparencyController.js|server/controllers/transparencyController.js]]
- Usa [[20 - Arquivos/server/cron/index.js|server/cron/index.js]]
- Usa [[20 - Arquivos/server/middleware/adminAuth.js|server/middleware/adminAuth.js]]
- Usa [[20 - Arquivos/server/middleware/csp.js|server/middleware/csp.js]]
- Usa [[20 - Arquivos/server/middleware/csrf.js|server/middleware/csrf.js]]
- Usa [[20 - Arquivos/server/middleware/distributedRateLimit.js|server/middleware/distributedRateLimit.js]]
- Usa [[20 - Arquivos/server/middleware/httpRequestLogger.js|server/middleware/httpRequestLogger.js]]
- Usa [[20 - Arquivos/server/middleware/httpsEnforcement.js|server/middleware/httpsEnforcement.js]]
- Usa [[20 - Arquivos/server/middleware/rateLimit.js|server/middleware/rateLimit.js]]
- Usa [[20 - Arquivos/server/middleware/turnstile.js|server/middleware/turnstile.js]]
- Usa [[20 - Arquivos/server/middleware/userActivityAudit.js|server/middleware/userActivityAudit.js]]
- Usa [[20 - Arquivos/server/models/database/serverDatabaseModel.js|server/models/database/serverDatabaseModel.js]]
- Usa [[20 - Arquivos/server/models/minerProfileModel.js|server/models/minerProfileModel.js]]
- Usa [[20 - Arquivos/server/models/shortlinkRewardModel.js|server/models/shortlinkRewardModel.js]]
- Usa [[20 - Arquivos/server/models/userModel.js|server/models/userModel.js]]
- Usa [[20 - Arquivos/server/routes/admin-auth.js|server/routes/admin-auth.js]]
- Usa [[20 - Arquivos/server/routes/admin-auto-mining-rewards.js|server/routes/admin-auto-mining-rewards.js]]
- Usa [[20 - Arquivos/server/routes/admin.js|server/routes/admin.js]]
- Usa [[20 - Arquivos/server/routes/auth.js|server/routes/auth.js]]
- Usa [[20 - Arquivos/server/routes/auto-mining-gpu.js|server/routes/auto-mining-gpu.js]]
- Usa [[20 - Arquivos/server/routes/broadcast.js|server/routes/broadcast.js]]
- Usa [[20 - Arquivos/server/routes/chat.js|server/routes/chat.js]]
- Usa [[20 - Arquivos/server/routes/checkin.js|server/routes/checkin.js]]
- Usa [[20 - Arquivos/server/routes/daily-tasks.js|server/routes/daily-tasks.js]]
- Usa [[20 - Arquivos/server/routes/deposit-tickets.js|server/routes/deposit-tickets.js]]
- Usa [[20 - Arquivos/server/routes/faucet.js|server/routes/faucet.js]]
- Usa [[20 - Arquivos/server/routes/games.js|server/routes/games.js]]
- Usa [[20 - Arquivos/server/routes/internal-offerwall.js|server/routes/internal-offerwall.js]]
- Usa [[20 - Arquivos/server/routes/inventory.js|server/routes/inventory.js]]
- Usa [[20 - Arquivos/server/routes/machines.js|server/routes/machines.js]]
- Usa [[20 - Arquivos/server/routes/mini-pass.js|server/routes/mini-pass.js]]
- Usa [[20 - Arquivos/server/routes/mining.js|server/routes/mining.js]]
- Usa [[20 - Arquivos/server/routes/notification.js|server/routes/notification.js]]
- Usa [[20 - Arquivos/server/routes/offer-events.js|server/routes/offer-events.js]]
- Usa [[20 - Arquivos/server/routes/ptp.js|server/routes/ptp.js]]
- Usa [[20 - Arquivos/server/routes/racks.js|server/routes/racks.js]]
- Usa [[20 - Arquivos/server/routes/ranking.js|server/routes/ranking.js]]
- Usa [[20 - Arquivos/server/routes/read-earn.js|server/routes/read-earn.js]]
- Usa [[20 - Arquivos/server/routes/rooms.js|server/routes/rooms.js]]
- Usa [[20 - Arquivos/server/routes/session.js|server/routes/session.js]]
- Usa [[20 - Arquivos/server/routes/shop.js|server/routes/shop.js]]
- Usa [[20 - Arquivos/server/routes/shortlink.js|server/routes/shortlink.js]]
- Usa [[20 - Arquivos/server/routes/sidebar-nav.js|server/routes/sidebar-nav.js]]
- Usa [[20 - Arquivos/server/routes/stats.js|server/routes/stats.js]]
- Usa [[20 - Arquivos/server/routes/support.js|server/routes/support.js]]
- Usa [[20 - Arquivos/server/routes/swap.js|server/routes/swap.js]]
- Usa [[20 - Arquivos/server/routes/user.js|server/routes/user.js]]
- Usa [[20 - Arquivos/server/routes/vault.js|server/routes/vault.js]]
- Usa [[20 - Arquivos/server/routes/wallet.js|server/routes/wallet.js]]
- Usa [[20 - Arquivos/server/routes/youtube.js|server/routes/youtube.js]]
- Usa [[20 - Arquivos/server/services/contractDepositSync.js|server/services/contractDepositSync.js]]
- Usa [[20 - Arquivos/server/services/depositVerifier.js|server/services/depositVerifier.js]]
- Usa [[20 - Arquivos/server/services/internalOfferwall/iframeHostAllowlistCache.js|server/services/internalOfferwall/iframeHostAllowlistCache.js]]
- Usa [[20 - Arquivos/server/services/polygonHdDepositScanner.js|server/services/polygonHdDepositScanner.js]]
- Usa [[20 - Arquivos/server/services/streaming/streamRunner.js|server/services/streaming/streamRunner.js]]
- Usa [[20 - Arquivos/server/services/supportRealtime.js|server/services/supportRealtime.js]]
- Usa [[20 - Arquivos/server/src/audit/index.js|server/src/audit/index.js]]
- Usa [[20 - Arquivos/server/src/bootstrap/ensureFaucetReward.js|server/src/bootstrap/ensureFaucetReward.js]]
- Usa [[20 - Arquivos/server/src/db/prisma.js|server/src/db/prisma.js]]
- Usa [[20 - Arquivos/server/src/miningEngine.js|server/src/miningEngine.js]]
- Usa [[20 - Arquivos/server/src/miningEngineInstance.js|server/src/miningEngineInstance.js]]
- Usa [[20 - Arquivos/server/src/socket/registerGamesSocketHandlers.js|server/src/socket/registerGamesSocketHandlers.js]]
- Usa [[20 - Arquivos/server/src/socket/registerMinerSocketHandlers.js|server/src/socket/registerMinerSocketHandlers.js]]
- Usa [[20 - Arquivos/server/src/socket/registerSupportSocketHandlers.js|server/src/socket/registerSupportSocketHandlers.js]]
- Usa [[20 - Arquivos/server/utils/authTokens.js|server/utils/authTokens.js]]
- Usa [[20 - Arquivos/server/utils/corsConfig.js|server/utils/corsConfig.js]]
- Usa [[20 - Arquivos/server/utils/logger.js|server/utils/logger.js]]
- Usa [[20 - Arquivos/server/utils/socketHandshakeAuthPolicy.js|server/utils/socketHandshakeAuthPolicy.js]]
- Usa [[20 - Arquivos/server/utils/token.js|server/utils/token.js]]

## Referenciado por

- Nenhum backlink local detectado.

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `24434 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
