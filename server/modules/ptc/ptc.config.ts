/** Rolling per-ad cooldown after a completed view (UTC timestamps). */
export const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** No heartbeat / activity reference for this long → cancel in-progress session. */
export const SESSION_STALE_MS = 90_000;

/** Max time to claim reward after session reaches `completed`. */
export const SESSION_CLAIM_WINDOW_MS = 2 * 60 * 60 * 1000;
