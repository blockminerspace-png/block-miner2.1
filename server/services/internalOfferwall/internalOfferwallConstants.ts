/** PTC-style iframe offer */
export const OFFER_KIND_PTC_IFRAME = "PTC_IFRAME";
/** Non-iframe task (manual / admin approval flow) */
export const OFFER_KIND_GENERAL_TASK = "GENERAL_TASK";

export const COMPLETION_USER_SELF_CLAIM = "USER_SELF_CLAIM";
export const COMPLETION_ADMIN_APPROVAL = "ADMIN_APPROVAL";

export const ATTEMPT_STATUS_STARTED = "STARTED";
export const ATTEMPT_STATUS_PENDING_REVIEW = "PENDING_REVIEW";
export const ATTEMPT_STATUS_COMPLETED = "COMPLETED";
export const ATTEMPT_STATUS_REJECTED = "REJECTED";

export const REWARD_BLK = "BLK";
export const REWARD_POL = "POL";
export const REWARD_HASHRATE_TEMP = "HASHRATE_TEMP";

/** Limit resets at the next Brazil-calendar day boundary (same as daily tasks). */
export const RESET_TYPE_DAILY = "DAILY";
/** Rolling window: at most N completions within the last `cooldownSeconds` seconds. */
export const RESET_TYPE_COOLDOWN = "COOLDOWN";
