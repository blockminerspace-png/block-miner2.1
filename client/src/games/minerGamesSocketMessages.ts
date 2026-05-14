/** Subset of i18n `t` used by game socket helpers (avoids branded `TFunction` in unit tests). */
export type MinerGameTranslate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Maps game socket payloads to user-facing strings (i18n via react-i18next `t`).
 * Supports coded payloads from the server and legacy plain-string errors.
 */

/**
 * @param t i18n `t`
 * @param payload Legacy string or `{ code, seconds? }`
 */
export function translateGameSocketError(t: MinerGameTranslate, payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return String(payload);
  const obj = payload as { code?: string; seconds?: number; message?: string };
  if (typeof obj.message === 'string' && !obj.code) return obj.message;
  const { code, seconds } = obj;
  if (!code || typeof code !== 'string') return typeof obj.message === 'string' ? obj.message : '';
  const key = `minerGames.socket_errors.${code}`;
  return seconds != null ? t(key, { seconds: Number(seconds) }) : t(key);
}

export function translateGameFinishedFailure(
  t: MinerGameTranslate,
  data: { messageCode?: string; message?: string } | null | undefined,
): string {
  if (data?.messageCode && typeof data.messageCode === 'string') {
    return t(`minerGames.game_finish.${data.messageCode}`);
  }
  if (typeof data?.message === 'string') return data.message;
  return '';
}

export function translateGameReward(
  t: MinerGameTranslate,
  data: { rewardCode?: string; rewardParams?: Record<string, unknown>; reward?: string } | null | undefined,
): string {
  if (data?.rewardCode && typeof data.rewardCode === 'string') {
    const key = `minerGames.game_reward.${data.rewardCode}`;
    const params = data.rewardParams && typeof data.rewardParams === 'object' ? data.rewardParams : undefined;
    return params ? t(key, params) : t(key);
  }
  if (typeof data?.reward === 'string') return data.reward;
  return '';
}
