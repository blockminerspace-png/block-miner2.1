/** No heartbeat / activity reference for this long → cancel in-progress session. */
export const SESSION_STALE_MS = 90_000;

/** Max time to claim reward after session reaches `completed`. */
export const SESSION_CLAIM_WINDOW_MS = 2 * 60 * 60 * 1000;
