/** Temporary mining power boost (UserPowerGame), same pattern as check-in milestones. */
export const READ_EARN_HASHRATE = "hashrate";
/** Credits user BLK balance (non-withdrawable pool token). */
export const READ_EARN_BLK = "blk";
/** Grants one inventory row from catalog Miner. */
export const READ_EARN_MACHINE = "machine";

export const READ_EARN_REWARD_TYPES = [READ_EARN_HASHRATE, READ_EARN_BLK, READ_EARN_MACHINE];

/** Generic client-facing failure (wrong code, inactive, full, misconfigured). */
export const REDEEM_GENERIC = "READ_EARN_UNAVAILABLE";
/** User already redeemed this campaign. */
export const REDEEM_ALREADY = "READ_EARN_ALREADY_CLAIMED";

export const READ_EARN_GAME_SLUG = "read-earn-partner";
