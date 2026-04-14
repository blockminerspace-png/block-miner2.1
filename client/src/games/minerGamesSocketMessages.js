/**
 * Maps game socket payloads to user-facing strings (i18n via react-i18next `t`).
 * Supports coded payloads from the server and legacy plain-string errors.
 */

/**
 * @param {import('i18next').TFunction} t
 * @param {unknown} payload - Legacy string or `{ code, seconds? }`
 * @returns {string}
 */
export function translateGameSocketError(t, payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return String(payload);
  const obj = /** @type {{ code?: string; seconds?: number; message?: string }} */ (payload);
  if (typeof obj.message === 'string' && !obj.code) return obj.message;
  const { code, seconds } = obj;
  if (!code || typeof code !== 'string') return typeof obj.message === 'string' ? obj.message : '';
  const key = `minerGames.socket_errors.${code}`;
  return seconds != null ? t(key, { seconds: Number(seconds) }) : t(key);
}

/**
 * @param {import('i18next').TFunction} t
 * @param {{ messageCode?: string; message?: string }} data
 * @returns {string}
 */
export function translateGameFinishedFailure(t, data) {
  if (data?.messageCode && typeof data.messageCode === 'string') {
    return t(`minerGames.game_finish.${data.messageCode}`);
  }
  if (typeof data?.message === 'string') return data.message;
  return '';
}

/**
 * @param {import('i18next').TFunction} t
 * @param {{ rewardCode?: string; rewardParams?: Record<string, unknown>; reward?: string }} data
 * @returns {string}
 */
export function translateGameReward(t, data) {
  if (data?.rewardCode && typeof data.rewardCode === 'string') {
    const key = `minerGames.game_reward.${data.rewardCode}`;
    const params = data.rewardParams && typeof data.rewardParams === 'object' ? data.rewardParams : undefined;
    return params ? t(key, params) : t(key);
  }
  if (typeof data?.reward === 'string') return data.reward;
  return '';
}
