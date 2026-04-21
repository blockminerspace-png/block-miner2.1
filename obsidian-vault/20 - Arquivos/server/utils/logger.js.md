---
source_path: "server/utils/logger.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 7501
modified_at: "2026-04-20T20:58:38.904Z"
outbound_local_refs: 2
inbound_local_refs: 71
---

# server/utils/logger.js

## O que é

Função utilitária compartilhada.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Conecta-se diretamente aos arquivos listados em dependências locais detectadas.

## Dependências locais detectadas

- Usa [[20 - Arquivos/server/models/auditLogModel.js|server/models/auditLogModel.js]]
- Usa [[20 - Arquivos/server/utils/clientIp.js|server/utils/clientIp.js]]

## Referenciado por

- É usado por [[20 - Arquivos/server/controllers/adminAuditController.js|server/controllers/adminAuditController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminAuthController.js|server/controllers/adminAuthController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminController.js|server/controllers/adminController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminReadEarnController.js|server/controllers/adminReadEarnController.js]]
- É usado por [[20 - Arquivos/server/controllers/autoMiningGpuController.js|server/controllers/autoMiningGpuController.js]]
- É usado por [[20 - Arquivos/server/controllers/autoMiningV2Controller.js|server/controllers/autoMiningV2Controller.js]]
- É usado por [[20 - Arquivos/server/controllers/blkWalletController.js|server/controllers/blkWalletController.js]]
- É usado por [[20 - Arquivos/server/controllers/btcpayDepositController.js|server/controllers/btcpayDepositController.js]]
- É usado por [[20 - Arquivos/server/controllers/btcpayWebhookController.js|server/controllers/btcpayWebhookController.js]]
- É usado por [[20 - Arquivos/server/controllers/chatController.js|server/controllers/chatController.js]]
- É usado por [[20 - Arquivos/server/controllers/checkinController.js|server/controllers/checkinController.js]]
- É usado por [[20 - Arquivos/server/controllers/depositTicketController.js|server/controllers/depositTicketController.js]]
- É usado por [[20 - Arquivos/server/controllers/faucetController.js|server/controllers/faucetController.js]]
- É usado por [[20 - Arquivos/server/controllers/internalOfferwallController.js|server/controllers/internalOfferwallController.js]]
- É usado por [[20 - Arquivos/server/controllers/machinesController.js|server/controllers/machinesController.js]]
- É usado por [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- É usado por [[20 - Arquivos/server/controllers/offerEventController.js|server/controllers/offerEventController.js]]
- É usado por [[20 - Arquivos/server/controllers/publicLiveStatsController.js|server/controllers/publicLiveStatsController.js]]
- É usado por [[20 - Arquivos/server/controllers/readEarnController.js|server/controllers/readEarnController.js]]
- É usado por [[20 - Arquivos/server/controllers/roomsController.js|server/controllers/roomsController.js]]
- É usado por [[20 - Arquivos/server/controllers/sessionController.js|server/controllers/sessionController.js]]
- É usado por [[20 - Arquivos/server/controllers/shopController.js|server/controllers/shopController.js]]
- É usado por [[20 - Arquivos/server/controllers/shortlinkController.js|server/controllers/shortlinkController.js]]
- É usado por [[20 - Arquivos/server/controllers/vaultController.js|server/controllers/vaultController.js]]
- É usado por [[20 - Arquivos/server/controllers/walletController.js|server/controllers/walletController.js]]
- É usado por [[20 - Arquivos/server/controllers/youtubeController.js|server/controllers/youtubeController.js]]
- É usado por [[20 - Arquivos/server/cron/backupCron.js|server/cron/backupCron.js]]
- É usado por [[20 - Arquivos/server/cron/blkRewardCycleCron.js|server/cron/blkRewardCycleCron.js]]
- É usado por [[20 - Arquivos/server/cron/callbackQueueCron.js|server/cron/callbackQueueCron.js]]
- É usado por [[20 - Arquivos/server/cron/checkinPendingCron.js|server/cron/checkinPendingCron.js]]
- É usado por [[20 - Arquivos/server/cron/depositsCron.js|server/cron/depositsCron.js]]
- É usado por [[20 - Arquivos/server/cron/gamePowerCleanup.js|server/cron/gamePowerCleanup.js]]
- É usado por [[20 - Arquivos/server/cron/miningCron.js|server/cron/miningCron.js]]
- É usado por [[20 - Arquivos/server/cron/offerEventsExpireCron.js|server/cron/offerEventsExpireCron.js]]
- É usado por [[20 - Arquivos/server/cron/securityArtifactCleanupCron.js|server/cron/securityArtifactCleanupCron.js]]
- É usado por [[20 - Arquivos/server/cron/shortlinkResetCron.js|server/cron/shortlinkResetCron.js]]
- É usado por [[20 - Arquivos/server/cron/withdrawalsCron.js|server/cron/withdrawalsCron.js]]
- É usado por [[20 - Arquivos/server/middleware/admin.js|server/middleware/admin.js]]
- É usado por [[20 - Arquivos/server/middleware/adminAuth.js|server/middleware/adminAuth.js]]
- É usado por [[20 - Arquivos/server/middleware/adminPageAuth.js|server/middleware/adminPageAuth.js]]
- É usado por [[20 - Arquivos/server/middleware/auth.js|server/middleware/auth.js]]
- É usado por [[20 - Arquivos/server/middleware/distributedRateLimit.js|server/middleware/distributedRateLimit.js]]
- É usado por [[20 - Arquivos/server/middleware/httpRequestLogger.js|server/middleware/httpRequestLogger.js]]
- É usado por [[20 - Arquivos/server/middleware/turnstile.js|server/middleware/turnstile.js]]
- É usado por [[20 - Arquivos/server/middleware/userActivityAudit.js|server/middleware/userActivityAudit.js]]
- É usado por [[20 - Arquivos/server/models/auditLogModel.js|server/models/auditLogModel.js]]
- É usado por [[20 - Arquivos/server/phdServer.js|server/phdServer.js]]
- É usado por [[20 - Arquivos/server/routes/admin.js|server/routes/admin.js]]
- É usado por [[20 - Arquivos/server/routes/auth.js|server/routes/auth.js]]
- É usado por [[20 - Arquivos/server/server.js|server/server.js]]
- É usado por [[20 - Arquivos/server/services/autoMiningV2/autoMiningV2DbAvailability.js|server/services/autoMiningV2/autoMiningV2DbAvailability.js]]
- É usado por [[20 - Arquivos/server/services/blkRewardDistributionService.js|server/services/blkRewardDistributionService.js]]
- É usado por [[20 - Arquivos/server/services/btcpayService.js|server/services/btcpayService.js]]
- É usado por [[20 - Arquivos/server/services/contractDepositSync.js|server/services/contractDepositSync.js]]
- É usado por [[20 - Arquivos/server/services/depositVerifier.js|server/services/depositVerifier.js]]
- É usado por [[20 - Arquivos/server/services/game2048Service.js|server/services/game2048Service.js]]
- É usado por [[20 - Arquivos/server/services/polygonHdDepositScanner.js|server/services/polygonHdDepositScanner.js]]
- É usado por [[20 - Arquivos/server/services/polygonHdSweep.js|server/services/polygonHdSweep.js]]
- É usado por [[20 - Arquivos/server/services/redisClient.js|server/services/redisClient.js]]
- É usado por [[20 - Arquivos/server/services/streaming/liveRtmpPipeline.js|server/services/streaming/liveRtmpPipeline.js]]
- É usado por [[20 - Arquivos/server/services/streaming/streamRunner.js|server/services/streaming/streamRunner.js]]
- É usado por [[20 - Arquivos/server/services/supportPlayerDossierService.js|server/services/supportPlayerDossierService.js]]
- É usado por [[20 - Arquivos/server/services/withdrawalTelegramService.js|server/services/withdrawalTelegramService.js]]
- É usado por [[20 - Arquivos/server/src/bootstrap/ensureFaucetReward.js|server/src/bootstrap/ensureFaucetReward.js]]
- É usado por [[20 - Arquivos/server/src/miningEngine.js|server/src/miningEngine.js]]
- É usado por [[20 - Arquivos/server/src/socket/registerGamesSocketHandlers.js|server/src/socket/registerGamesSocketHandlers.js]]
- É usado por [[20 - Arquivos/server/src/wallet/autoWithdraw.js|server/src/wallet/autoWithdraw.js]]
- É usado por [[20 - Arquivos/server/utils/mailer.js|server/utils/mailer.js]]
- É usado por [[20 - Arquivos/server/utils/miningRewardsLogger.js|server/utils/miningRewardsLogger.js]]
- É usado por [[20 - Arquivos/server/utils/securityLogger.js|server/utils/securityLogger.js]]
- É usado por [[20 - Arquivos/tests/logger.test.mjs|tests/logger.test.mjs]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `7501 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
