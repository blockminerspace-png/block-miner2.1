# Testes e Qualidade

## Suíte raiz

```text
tests/
├── adminAccountCollisionService.test.mjs
├── adminAuditListService.test.mjs
├── adminPasswordResetPolicy.test.mjs
├── audit.query.test.js
├── audit.test.js
├── authTokens.test.js
├── autoMiningV2.domain.test.js
├── btcpayService.test.js
├── buildUserAuditSnapshotMinersSelect.test.mjs
├── checkinBalanceAuditLog.test.mjs
├── checkinBalanceGate.test.js
├── checkinChainAmounts.test.mjs
├── checkinEvaluateTxStrict.test.mjs
├── checkinPaymentEnforcement.test.mjs
├── checkinPeriodKeys.test.mjs
├── checkinReceiverResolve.test.js
├── checkinWalletRequired.test.mjs
├── contractDepositLog.test.js
├── dailyTaskDefinitionAdminValidation.test.js
├── dailyTaskProgressInternalOfferwallDestructuring.test.mjs
├── dailyTasks.period.test.js
├── databaseBackupService.test.mjs
├── depositsCron.test.js
├── emailTwoFactorService.test.mjs
├── faucetInventoryNoExpiry.test.mjs
├── game2048Constants.test.mjs
├── game2048Engine.test.mjs
├── iframeHostAllowlistCache.test.mjs
├── internalOfferwall.validateIframeUrl.test.mjs
├── internalOfferwallLimitState.test.mjs
├── internalOfferwallMinViewLogic.test.mjs
├── internalOfferwallTaskMetadata.test.mjs
├── logger.test.mjs
├── machineInstanceState.test.mjs
├── machinePlacementMapping.test.mjs
├── memoryGameConstants.test.js
├── miniPass.adminValidation.test.mjs
├── miniPass.i18n.test.mjs
├── miniPass.levelMath.test.mjs
├── miniPassAdminForm.test.mjs
├── miniPassPeriod.test.mjs
├── miningEngineRewards.test.js
├── offerEvents.helpers.test.mjs
├── offerEvents.listQuery.test.mjs
├── offerEvents.publicList.test.mjs
├── openrouterAskScript.test.mjs
├── polygonDepositConfig.test.js
├── polygonHdConfig.test.mjs
├── polygonHdDepositScanner.test.mjs
├── polygonHdWallet.test.mjs
├── publicLiveStatsService.test.js
├── rackMinerRelease.test.js
├── readEarn.isLive.test.mjs
├── readEarnSchemas.test.mjs
├── registerBodySchema.test.mjs
├── requestPublicOrigin.test.js
├── rooms.test.js
├── shopIdempotencyStore.test.mjs
├── sidebarNavPaths.test.js
├── sidebarNavRegistry.test.js
├── socketHandshakeAuthPolicy.test.mjs
├── stableRequestHash.test.mjs
├── streamAdminValidation.test.js
├── streamRestartPolicy.test.mjs
├── streamRunner.pendingRestart.test.mjs
├── streamSecrets.test.js
├── supportMessagePayload.test.mjs
├── supportPlayerDossierService.test.js
├── token.test.js
├── transactionLocks.test.mjs
├── transparency.test.mjs
├── transparencyWalletService.test.mjs
├── turnstile.resolveSecret.test.mjs
├── userActivityAuditMiddleware.test.mjs
├── vaultSchemas.test.mjs
├── verify_security_fix.mjs
├── walletDeposit.test.js
├── walletValidation.test.js
└── walletWithdraw.test.js
```

## Testes do frontend

```text
client/src/**/*
├── *.test.jsx
├── *.test.js
└── *.test.mjs
```

## Testes do backend

```text
tests/
server/test_db.js
scripts/run-node-tests.mjs
coverage-server.txt
docs/coverage-report.md
```
