import { run } from "../src/db/sqlite.js";
import { errMsg } from "../types/tsNarrowing.js";
import loggerLib from "./logger.js";

const logger = loggerLib.child("MiningRewardsLogger");

export type MiningRewardLogInput = {
  userId: number;
  blockNumber: number;
  workAccumulated: number;
  totalNetworkWork: number;
  sharePercentage: number;
  rewardAmount: number;
  balanceAfter: number;
};

/**
 * Log a mining reward to the database for user visibility
 */
export async function logMiningReward(reward: MiningRewardLogInput): Promise<void> {
  try {
    await run(
      `
        INSERT INTO mining_rewards_log
          (user_id, block_number, work_accumulated, total_network_work, share_percentage, reward_amount, balance_after_reward, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        reward.userId,
        reward.blockNumber,
        reward.workAccumulated,
        reward.totalNetworkWork,
        reward.sharePercentage,
        reward.rewardAmount,
        reward.balanceAfter,
        Date.now(),
      ],
    );

    await run("UPDATE users_temp_power SET balance = ? WHERE user_id = ?", [reward.balanceAfter, reward.userId]);

    await run("UPDATE users SET pol_balance = ? WHERE id = ?", [reward.balanceAfter, reward.userId]);

    logger.debug("Mining reward logged and balance updated", {
      userId: reward.userId,
      blockNumber: reward.blockNumber,
      rewardAmount: reward.rewardAmount.toFixed(8),
      newBalance: reward.balanceAfter.toFixed(8),
    });
  } catch (error: unknown) {
    logger.error("Failed to log mining reward", {
      error: errMsg(error),
      userId: reward.userId,
      blockNumber: reward.blockNumber,
    });
  }
}
