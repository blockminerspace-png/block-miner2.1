/** V1 GPU claim limits */
export const V1_DAILY_LIMIT = 24;
export const V1_CLAIM_COST_SECONDS = 300;

/** V2 session constants — mirrored in auto-mining.domain.ts for pure-function use */
export const V2_NORMAL_HASH_PER_CYCLE = 5;
export const V2_TURBO_HASH_PER_CYCLE = 10;
export const V2_CYCLE_SECONDS = 60;
export const V2_DAILY_LIMIT_HASH = 1000;
export const V2_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
export const V2_CLICK_GRACE_MS = 3 * 60 * 1000;
export const V2_MIN_CLICK_DELAY_MS = 400;
export const V2_NEGATIVE_CACHE_MS = 45_000;
