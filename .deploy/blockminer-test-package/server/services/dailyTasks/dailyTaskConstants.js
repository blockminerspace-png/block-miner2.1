/** Server-side task kinds (must match `daily_task_definitions.task_type`). */
export const TASK_LOGIN_DAY = "LOGIN_DAY";
export const TASK_MINE_BLK = "MINE_BLK";
export const TASK_PLAY_GAMES = "PLAY_GAMES";
export const TASK_WATCH_YOUTUBE = "WATCH_YOUTUBE";
/** Counts internal offerwall completions (PTC / general) when hooked from offer flow. */
export const TASK_INTERNAL_OFFERWALL = "INTERNAL_OFFERWALL";

/** Client-facing progress states. */
export const STATUS_AVAILABLE = "available";
export const STATUS_IN_PROGRESS = "in_progress";
export const STATUS_COMPLETED = "completed";
export const STATUS_CLAIMED = "claimed";
