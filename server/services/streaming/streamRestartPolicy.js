/** Backoff (ms) after ffmpeg/capture failures while the admin still wants the stream on. */
const RESTART_DELAYS_MS = [8000, 16000, 32000, 60000, 120000];

export const MAX_AUTO_RESTART_ATTEMPTS = 25;

/**
 * @param {number} attempt zero-based
 * @returns {number}
 */
export function restartDelayMsForAttempt(attempt) {
  const i = Math.min(Math.max(0, attempt), RESTART_DELAYS_MS.length - 1);
  return RESTART_DELAYS_MS[i];
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function isPermanentStreamStartFailure(message) {
  const m = String(message || "");
  return (
    /STREAM_CAPTURE_DISABLED/i.test(m) ||
    /STREAM_UNSUPPORTED_OS/i.test(m) ||
    /Missing stream key|STREAM_ENCRYPTION_KEY|Invalid stream key configuration/i.test(m)
  );
}
