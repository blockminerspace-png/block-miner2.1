import { startMiningLoop, type MiningEngineLike, type MiningIoLike } from "./miningCron.js";
import { startGamePowerCleanup } from "./gamePowerCleanup.js";
import { startWithdrawalMonitoring } from "./withdrawalsCron.js";
// import { startBackupCron, runFullSiteBackupOnStartup } from "./backupCron.js";
import { startCallbackQueueProcessing } from "./callbackQueueCron.js";
import { startShortlinkResetCron } from "./shortlinkResetCron.js";
import { startDepositMonitoring } from "./depositsCron.js";
import { startCheckinPendingCron } from "./checkinPendingCron.js";
import { startOfferEventsExpireCron } from "./offerEventsExpireCron.js";
import { startSecurityArtifactCleanupCron } from "./securityArtifactCleanupCron.js";
import { startWalletSnapshotCron } from "./walletSnapshotCron.js";
import { startTournamentsCron } from "../modules/tournaments/tournaments.cron.js";

export type StartCronTasksParams = {
  engine: MiningEngineLike;
  io: MiningIoLike;
  persistMinerProfile: (miner: unknown) => unknown;
  run?: unknown;
  buildPublicState?: (id?: unknown) => Promise<unknown> | unknown;
  syncEngineMiners?: unknown;
  syncUserBaseHashRate: (userId: number) => Promise<number> | number;
};

export function startCronTasks({
  engine,
  io,
  persistMinerProfile,
  run,
  buildPublicState,
  syncEngineMiners,
  syncUserBaseHashRate,
}: StartCronTasksParams): Record<string, unknown> {
  const miningTimers = startMiningLoop(
    { engine, io, persistMinerProfile, buildPublicState },
    { syncEngineMiners, syncUserBaseHashRate },
  );

  const cleanupTimers = startGamePowerCleanup({ engine, io, run });
  const withdrawalTimers = startWithdrawalMonitoring();
  // const backupTimers = startBackupCron({ run });
  const callbackQueueTimers = startCallbackQueueProcessing();
  const shortlinkResetTimers = startShortlinkResetCron();
  const depositTimers = startDepositMonitoring();
  const checkinPendingTimers = startCheckinPendingCron();
  const offerEventsExpireTimers = startOfferEventsExpireCron();
  const securityArtifactTimers = startSecurityArtifactCleanupCron();
  const walletSnapshotTimers   = startWalletSnapshotCron();
  const tournamentTimers       = startTournamentsCron();

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
    ...offerEventsExpireTimers,
    ...securityArtifactTimers,
    ...walletSnapshotTimers,
    ...tournamentTimers,
  };
}
