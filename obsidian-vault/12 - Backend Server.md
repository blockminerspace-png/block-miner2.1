# Backend Server

## Estrutura principal

```text
server/
├── phdServer.js
├── server.js
├── test_db.js
├── controllers/
├── cron/
├── logs/
├── middleware/
├── models/
├── prisma/
├── routes/
├── scripts/
├── services/
├── src/
├── storage/
├── utils/
└── validation/
```

## `controllers`

```text
controllers/
├── adminAuditController.js
├── adminAuthController.js
├── adminCheckinMilestoneController.js
├── adminController.js
├── adminDailyTasksController.js
├── adminInternalOfferwallController.js
├── adminMiniPassController.js
├── adminOfferEventController.js
├── adminReadEarnController.js
├── adminSupportController.js
├── adminUserInsightsController.js
├── adminWithdrawalTelegramController.js
├── adminYoutubeStreamController.js
├── autoMiningGpuController.js
├── autoMiningRewardsController.js
├── autoMiningV2Controller.js
├── bannerController.js
├── blkWalletController.js
├── btcpayDepositController.js
├── btcpayWebhookController.js
├── chatController.js
├── checkinController.js
├── creatorController.js
├── dailyTasksController.js
├── depositTicketController.js
├── faucetController.js
├── game2048Controller.js
├── gamesPowerController.js
├── healthController.js
├── internalOfferwallController.js
├── inventoryController.js
├── machinesController.js
├── miniPassController.js
├── miningController.js
├── notificationController.js
├── offerEventController.js
├── powerStatsController.js
├── ptpController.js
├── publicLiveStatsController.js
├── racksController.js
├── readEarnController.js
├── roomsController.js
├── sessionController.js
├── shopController.js
├── shortlinkController.js
├── sidebarNavController.js
├── supportController.js
├── swapController.js
├── transparencyController.js
├── userController.js
├── vaultController.js
├── walletController.js
├── youtubeController.js
└── database/
    └── serverDatabaseController.js
```

## `routes`

```text
routes/
├── admin-auth.js
├── admin-auto-mining-rewards.js
├── admin-logs.js
├── admin-mini-pass.js
├── admin-offer-events.js
├── admin-youtube-stream.js
├── admin.js
├── auth.js
├── auto-mining-gpu.js
├── broadcast.js
├── chat.js
├── checkin.js
├── daily-tasks.js
├── deposit-tickets.js
├── faucet.js
├── game2048.routes.js
├── games.js
├── internal-offerwall.js
├── inventory.js
├── machines.js
├── mini-pass.js
├── mining.js
├── notification.js
├── offer-events.js
├── ptp.js
├── racks.js
├── ranking.js
├── read-earn.js
├── rooms.js
├── session.js
├── shop.js
├── shortlink.js
├── sidebar-nav.js
├── stats.js
├── support.js
├── swap.js
├── user.js
├── vault.js
├── wallet.js
└── youtube.js
```

## `services`

```text
services/
├── accountLockoutService.js
├── adminAccountCollisionService.js
├── adminAuditListService.js
├── adminFraudSignalsService.js
├── blkRewardDistributionService.js
├── blockMinerDepositAbi.js
├── btcpayService.js
├── checkinChain.js
├── checkinMilestoneService.js
├── contractDepositLog.js
├── contractDepositSync.js
├── databaseBackupService.js
├── depositVerifier.js
├── distributedLockService.js
├── emailTwoFactorService.js
├── game2048Engine.js
├── game2048Service.js
├── idempotencyService.js
├── networkHashrateService.js
├── offerEventHelpers.js
├── offerEventPurchaseService.js
├── polygonDepositConfig.js
├── polygonHdConfig.js
├── polygonHdDepositScanner.js
├── polygonHdSweep.js
├── polygonHdWallet.js
├── polygonProvider.js
├── publicLiveStatsService.js
├── readEarnService.js
├── redisClient.js
├── shopIdempotencyStore.js
├── sidebarNavRegistry.js
├── sidebarNavService.js
├── slidingWindowRateLimit.js
├── supportPlayerDossierService.js
├── supportRealtime.js
├── supportTicketService.js
├── transparencyWalletService.js
├── userOwnedMachineService.js
├── withdrawalTelegramService.js
├── autoMiningV2/
├── dailyTasks/
├── internalOfferwall/
├── miniPass/
└── streaming/
```

## `prisma`, `src` e camadas utilitárias

```text
prisma/
├── migrations/
├── schema.prisma
├── schema_minimal.prisma
└── seed.js

src/
├── audit/
├── bootstrap/
├── config/
├── db/
├── runtime/
├── services/
├── socket/
├── wallet/
├── miningEngine.js
└── miningEngineInstance.js

middleware/
models/
utils/
validation/
cron/
storage/
```

## Observação de arquitetura

- `routes/` expõe HTTP.
- `controllers/` orquestram entrada/saída.
- `services/` concentra regras de negócio.
- `models/` e `prisma/` lidam com persistência e acesso a dados.
- `src/` agrupa subsistemas mais novos e estruturados, principalmente auditoria, runtime, DB e sockets.
