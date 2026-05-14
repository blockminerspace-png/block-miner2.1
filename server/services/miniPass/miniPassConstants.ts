/** Cadence: how often mission progress resets. */
export const CADENCE_EVENT = "EVENT";
export const CADENCE_DAILY = "DAILY";
export const CADENCE_WEEKLY = "WEEKLY";

/** What the mission measures (server-side signals only). */
export const MISSION_PLAY_GAMES = "PLAY_GAMES";
export const MISSION_MINE_BLK = "MINE_BLK";
export const MISSION_LOGIN_DAY = "LOGIN_DAY";
export const MISSION_WATCH_YOUTUBE = "WATCH_YOUTUBE";
export const MISSION_AUTO_MINING_TURBO = "AUTO_MINING_TURBO";
export const MISSION_INTERNAL_OFFERWALL = "INTERNAL_OFFERWALL";

/** XP ledger source — helps audits and support tooling. */
export const XP_SOURCE_MISSION = "MISSION";
export const XP_SOURCE_PURCHASE = "PURCHASE";

/** Per-tier reward delivery strategy. */
export const REWARD_NONE = "NONE";
export const REWARD_SHOP_MINER = "SHOP_MINER";
export const REWARD_EVENT_MINER = "EVENT_MINER";
export const REWARD_HASHRATE_TEMP = "HASHRATE_TEMP";
export const REWARD_BLK = "BLK";
export const REWARD_POL = "POL";

export const PURCHASE_BUY_LEVEL = "BUY_LEVEL";
export const PURCHASE_COMPLETE_PASS = "COMPLETE_PASS";

/** Internal game slug for temporary hashrate rows (UserPowerGame). */
export const MINI_PASS_GAME_SLUG = "mini-pass-bonus";

export const EVENT_PERIOD_KEY = "__EVENT__";
