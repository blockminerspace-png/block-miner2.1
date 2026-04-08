import { startMiningLoop } from "./miningCron.js";
import { startGamePowerCleanup } from "./gamePowerCleanup.js";
import { startWithdrawalMonitoring } from "./withdrawalsCron.js";
import { startBackupCron, runFullSiteBackupOnStartup } from "./backupCron.js";
import { startCallbackQueueProcessing } from "./callbackQueueCron.js";
import { startShortlinkResetCron } from "./shortlinkResetCron.js";
import { startDepositMonitoring } from "./depositsCron.js";
import { startCheckinPendingCron } from "./checkinPendingCron.js";
import { startOfferEventsExpireCron } from "./offerEventsExpireCron.js";

export function startCronTasks({
  engine,
  io,
  persistMinerProfile,
  run,
  buildPublicState,
  syncEngineMiners,
  syncUserBaseHashRate
}) {
  const miningTimers = startMiningLoop(
    { engine, io, persistMinerProfile, buildPublicState },
    { syncEngineMiners, syncUserBaseHashRate }
  );

  const cleanupTimers = startGamePowerCleanup({ engine, io, run });
  const withdrawalTimers = startWithdrawalMonitoring();
  // const backupTimers = startBackupCron({ run });
  const callbackQueueTimers = startCallbackQueueProcessing();
  const shortlinkResetTimers = startShortlinkResetCron();
  const depositTimers = startDepositMonitoring();
  const checkinPendingTimers = startCheckinPendingCron();
  const offerEventsExpireTimers = startOfferEventsExpireCron();

  // Run full site backup on startup (includes DB + all files)
  // runFullSiteBackupOnStartup();

  return {
    ...miningTimers,
    ...cleanupTimers,
    ...withdrawalTimers,
    // ...backupTimers,
    ...callbackQueueTimers,
    ...shortlinkResetTimers,
    ...depositTimers,
    ...checkinPendingTimers,
    ...offerEventsExpireTimers
  };
}
