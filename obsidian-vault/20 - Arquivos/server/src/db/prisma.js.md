---
source_path: "server/src/db/prisma.js"
domain: backend
language: "JavaScript"
extension: ".js"
size_bytes: 351
modified_at: "2026-04-02T15:51:05.000Z"
outbound_local_refs: 0
inbound_local_refs: 107
---

# server/src/db/prisma.js

## O que é

Arquivo do projeto.

## Por que existe

Existe para sustentar API, regras de negócio, persistência e automações.

## O que conecta com quem

Sem dependências locais detectadas automaticamente.

## Dependências locais detectadas

- Nenhuma dependência local detectada.

## Referenciado por

- É usado por [[20 - Arquivos/scripts/clear-faucet-inventory-expiry.mjs|scripts/clear-faucet-inventory-expiry.mjs]]
- É usado por [[20 - Arquivos/server/controllers/adminCheckinMilestoneController.js|server/controllers/adminCheckinMilestoneController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminController.js|server/controllers/adminController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminDailyTasksController.js|server/controllers/adminDailyTasksController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminInternalOfferwallController.js|server/controllers/adminInternalOfferwallController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminMiniPassController.js|server/controllers/adminMiniPassController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminOfferEventController.js|server/controllers/adminOfferEventController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminReadEarnController.js|server/controllers/adminReadEarnController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminSupportController.js|server/controllers/adminSupportController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminUserInsightsController.js|server/controllers/adminUserInsightsController.js]]
- É usado por [[20 - Arquivos/server/controllers/adminYoutubeStreamController.js|server/controllers/adminYoutubeStreamController.js]]
- É usado por [[20 - Arquivos/server/controllers/autoMiningGpuController.js|server/controllers/autoMiningGpuController.js]]
- É usado por [[20 - Arquivos/server/controllers/autoMiningRewardsController.js|server/controllers/autoMiningRewardsController.js]]
- É usado por [[20 - Arquivos/server/controllers/bannerController.js|server/controllers/bannerController.js]]
- É usado por [[20 - Arquivos/server/controllers/btcpayDepositController.js|server/controllers/btcpayDepositController.js]]
- É usado por [[20 - Arquivos/server/controllers/btcpayWebhookController.js|server/controllers/btcpayWebhookController.js]]
- É usado por [[20 - Arquivos/server/controllers/chatController.js|server/controllers/chatController.js]]
- É usado por [[20 - Arquivos/server/controllers/checkinController.js|server/controllers/checkinController.js]]
- É usado por [[20 - Arquivos/server/controllers/creatorController.js|server/controllers/creatorController.js]]
- É usado por [[20 - Arquivos/server/controllers/depositTicketController.js|server/controllers/depositTicketController.js]]
- É usado por [[20 - Arquivos/server/controllers/faucetController.js|server/controllers/faucetController.js]]
- É usado por [[20 - Arquivos/server/controllers/gamesPowerController.js|server/controllers/gamesPowerController.js]]
- É usado por [[20 - Arquivos/server/controllers/inventoryController.js|server/controllers/inventoryController.js]]
- É usado por [[20 - Arquivos/server/controllers/machinesController.js|server/controllers/machinesController.js]]
- É usado por [[20 - Arquivos/server/controllers/miningController.js|server/controllers/miningController.js]]
- É usado por [[20 - Arquivos/server/controllers/notificationController.js|server/controllers/notificationController.js]]
- É usado por [[20 - Arquivos/server/controllers/offerEventController.js|server/controllers/offerEventController.js]]
- É usado por [[20 - Arquivos/server/controllers/powerStatsController.js|server/controllers/powerStatsController.js]]
- É usado por [[20 - Arquivos/server/controllers/ptpController.js|server/controllers/ptpController.js]]
- É usado por [[20 - Arquivos/server/controllers/roomsController.js|server/controllers/roomsController.js]]
- É usado por [[20 - Arquivos/server/controllers/sessionController.js|server/controllers/sessionController.js]]
- É usado por [[20 - Arquivos/server/controllers/shopController.js|server/controllers/shopController.js]]
- É usado por [[20 - Arquivos/server/controllers/shortlinkController.js|server/controllers/shortlinkController.js]]
- É usado por [[20 - Arquivos/server/controllers/supportController.js|server/controllers/supportController.js]]
- É usado por [[20 - Arquivos/server/controllers/swapController.js|server/controllers/swapController.js]]
- É usado por [[20 - Arquivos/server/controllers/transparencyController.js|server/controllers/transparencyController.js]]
- É usado por [[20 - Arquivos/server/controllers/userController.js|server/controllers/userController.js]]
- É usado por [[20 - Arquivos/server/controllers/vaultController.js|server/controllers/vaultController.js]]
- É usado por [[20 - Arquivos/server/controllers/walletController.js|server/controllers/walletController.js]]
- É usado por [[20 - Arquivos/server/controllers/youtubeController.js|server/controllers/youtubeController.js]]
- É usado por [[20 - Arquivos/server/cron/depositsCron.js|server/cron/depositsCron.js]]
- É usado por [[20 - Arquivos/server/cron/gamePowerCleanup.js|server/cron/gamePowerCleanup.js]]
- É usado por [[20 - Arquivos/server/cron/offerEventsExpireCron.js|server/cron/offerEventsExpireCron.js]]
- É usado por [[20 - Arquivos/server/cron/securityArtifactCleanupCron.js|server/cron/securityArtifactCleanupCron.js]]
- É usado por [[20 - Arquivos/server/models/autoMiningGpuModel.js|server/models/autoMiningGpuModel.js]]
- É usado por [[20 - Arquivos/server/models/blkEconomyModel.js|server/models/blkEconomyModel.js]]
- É usado por [[20 - Arquivos/server/models/blkWalletModel.js|server/models/blkWalletModel.js]]
- É usado por [[20 - Arquivos/server/models/database/serverDatabaseModel.js|server/models/database/serverDatabaseModel.js]]
- É usado por [[20 - Arquivos/server/models/db.js|server/models/db.js]]
- É usado por [[20 - Arquivos/server/models/inventoryModel.js|server/models/inventoryModel.js]]
- É usado por [[20 - Arquivos/server/models/machineModel.js|server/models/machineModel.js]]
- É usado por [[20 - Arquivos/server/models/minerProfileModel.js|server/models/minerProfileModel.js]]
- É usado por [[20 - Arquivos/server/models/minersModel.js|server/models/minersModel.js]]
- É usado por [[20 - Arquivos/server/models/referralModel.js|server/models/referralModel.js]]
- É usado por [[20 - Arquivos/server/models/refreshTokenModel.js|server/models/refreshTokenModel.js]]
- É usado por [[20 - Arquivos/server/models/userModel.js|server/models/userModel.js]]
- É usado por [[20 - Arquivos/server/models/vaultModel.js|server/models/vaultModel.js]]
- É usado por [[20 - Arquivos/server/models/walletModel.js|server/models/walletModel.js]]
- É usado por [[20 - Arquivos/server/routes/admin.js|server/routes/admin.js]]
- É usado por [[20 - Arquivos/server/routes/auth.js|server/routes/auth.js]]
- É usado por [[20 - Arquivos/server/routes/broadcast.js|server/routes/broadcast.js]]
- É usado por [[20 - Arquivos/server/routes/ranking.js|server/routes/ranking.js]]
- É usado por [[20 - Arquivos/server/server.js|server/server.js]]
- É usado por [[20 - Arquivos/server/services/accountLockoutService.js|server/services/accountLockoutService.js]]
- É usado por [[20 - Arquivos/server/services/adminAuditListService.js|server/services/adminAuditListService.js]]
- É usado por [[20 - Arquivos/server/services/autoMiningV2/autoMiningV2DbAvailability.js|server/services/autoMiningV2/autoMiningV2DbAvailability.js]]
- É usado por [[20 - Arquivos/server/services/autoMiningV2/autoMiningV2Service.js|server/services/autoMiningV2/autoMiningV2Service.js]]
- É usado por [[20 - Arquivos/server/services/blkRewardDistributionService.js|server/services/blkRewardDistributionService.js]]
- É usado por [[20 - Arquivos/server/services/checkinMilestoneService.js|server/services/checkinMilestoneService.js]]
- É usado por [[20 - Arquivos/server/services/contractDepositSync.js|server/services/contractDepositSync.js]]
- É usado por [[20 - Arquivos/server/services/dailyTasks/dailyTaskClaimService.js|server/services/dailyTasks/dailyTaskClaimService.js]]
- É usado por [[20 - Arquivos/server/services/dailyTasks/dailyTaskDashboardService.js|server/services/dailyTasks/dailyTaskDashboardService.js]]
- É usado por [[20 - Arquivos/server/services/dailyTasks/dailyTaskProgressService.js|server/services/dailyTasks/dailyTaskProgressService.js]]
- É usado por [[20 - Arquivos/server/services/depositVerifier.js|server/services/depositVerifier.js]]
- É usado por [[20 - Arquivos/server/services/game2048Service.js|server/services/game2048Service.js]]
- É usado por [[20 - Arquivos/server/services/idempotencyService.js|server/services/idempotencyService.js]]
- É usado por [[20 - Arquivos/server/services/internalOfferwall/buildUserAuditSnapshot.js|server/services/internalOfferwall/buildUserAuditSnapshot.js]]
- É usado por [[20 - Arquivos/server/services/internalOfferwall/internalOfferwallService.js|server/services/internalOfferwall/internalOfferwallService.js]]
- É usado por [[20 - Arquivos/server/services/miniPass/miniPassClaimService.js|server/services/miniPass/miniPassClaimService.js]]
- É usado por [[20 - Arquivos/server/services/miniPass/miniPassDashboardService.js|server/services/miniPass/miniPassDashboardService.js]]
- É usado por [[20 - Arquivos/server/services/miniPass/miniPassMissionHookService.js|server/services/miniPass/miniPassMissionHookService.js]]
- É usado por [[20 - Arquivos/server/services/miniPass/miniPassPurchaseService.js|server/services/miniPass/miniPassPurchaseService.js]]
- É usado por [[20 - Arquivos/server/services/miniPass/miniPassRewardFulfillmentService.js|server/services/miniPass/miniPassRewardFulfillmentService.js]]
- É usado por [[20 - Arquivos/server/services/miniPass/miniPassXpService.js|server/services/miniPass/miniPassXpService.js]]
- É usado por [[20 - Arquivos/server/services/offerEventPurchaseService.js|server/services/offerEventPurchaseService.js]]
- É usado por [[20 - Arquivos/server/services/polygonHdDepositScanner.js|server/services/polygonHdDepositScanner.js]]
- É usado por [[20 - Arquivos/server/services/polygonHdSweep.js|server/services/polygonHdSweep.js]]
- É usado por [[20 - Arquivos/server/services/polygonHdWallet.js|server/services/polygonHdWallet.js]]
- É usado por [[20 - Arquivos/server/services/publicLiveStatsService.js|server/services/publicLiveStatsService.js]]
- É usado por [[20 - Arquivos/server/services/readEarnService.js|server/services/readEarnService.js]]
- É usado por [[20 - Arquivos/server/services/sidebarNavService.js|server/services/sidebarNavService.js]]
- É usado por [[20 - Arquivos/server/services/slidingWindowRateLimit.js|server/services/slidingWindowRateLimit.js]]
- É usado por [[20 - Arquivos/server/services/streaming/streamRunner.js|server/services/streaming/streamRunner.js]]
- É usado por [[20 - Arquivos/server/services/streaming/youtubeStreamService.js|server/services/streaming/youtubeStreamService.js]]
- É usado por [[20 - Arquivos/server/services/supportTicketService.js|server/services/supportTicketService.js]]
- É usado por [[20 - Arquivos/server/services/withdrawalTelegramService.js|server/services/withdrawalTelegramService.js]]
- É usado por [[20 - Arquivos/server/src/audit/query/repository.js|server/src/audit/query/repository.js]]
- É usado por [[20 - Arquivos/server/src/audit/service.js|server/src/audit/service.js]]
- É usado por [[20 - Arquivos/server/src/audit/worker.js|server/src/audit/worker.js]]
- É usado por [[20 - Arquivos/server/src/bootstrap/ensureFaucetReward.js|server/src/bootstrap/ensureFaucetReward.js]]
- É usado por [[20 - Arquivos/server/src/socket/registerGamesSocketHandlers.js|server/src/socket/registerGamesSocketHandlers.js]]
- É usado por [[20 - Arquivos/server/src/socket/registerSupportSocketHandlers.js|server/src/socket/registerSupportSocketHandlers.js]]
- É usado por [[20 - Arquivos/server/src/wallet/autoWithdraw.js|server/src/wallet/autoWithdraw.js]]
- É usado por [[20 - Arquivos/server/test_db.js|server/test_db.js]]
- É usado por [[20 - Arquivos/server/utils/checkinStreak.js|server/utils/checkinStreak.js]]
- É usado por [[20 - Arquivos/tests/rooms.test.js|tests/rooms.test.js]]
- É usado por [[20 - Arquivos/tests/walletDeposit.test.js|tests/walletDeposit.test.js]]

## Classificação

- Domínio: `backend`
- Linguagem/tipo: `JavaScript`
- Tamanho: `351 bytes`

## Observação técnica

Análise automática baseada em caminho, extensão e referências locais estáticas.

## Navegação

- Voltar ao [[01 - Mapa Detalhado]]
- Ver índice da área em [[30 - Índices/30 - Índice - server|server]]
