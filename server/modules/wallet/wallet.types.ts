/** Minimum POL for a withdrawal request. */
export const WITHDRAW_MIN_POL = 10;

/**
 * Business days (in hours) expected before a withdrawal is processed.
 * Shown to users — informational only.
 */
export const WITHDRAW_PROCESSING_HOURS = 72;

export const VALID_MINING_PAYOUT_MODES = new Set<string>(["pol"]);
