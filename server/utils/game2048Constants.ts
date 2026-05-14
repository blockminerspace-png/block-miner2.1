/** Slug for `Game` row tied to Chain 2048 temporary hashrate. */
export const GAME2048_GAME_SLUG = "block-2048";

export function game2048WinTile() {
  const n = Number(process.env.GAME2048_WIN_TILE || 2048);
  const v = Math.floor(Number.isFinite(n) ? n : 2048);
  return Math.max(8, Math.min(131072, v));
}

export function game2048MinScore() {
  const n = Number(process.env.GAME2048_MIN_SCORE || 500);
  return Math.max(0, Math.min(10_000_000, Math.floor(Number.isFinite(n) ? n : 500)));
}

export function game2048RewardHashRate() {
  const n = Number(process.env.GAME2048_REWARD_HASHRATE || 25);
  return Math.max(1, Math.min(100_000, Number.isFinite(n) ? n : 25));
}

export function game2048CooldownMs() {
  const n = Number(process.env.GAME2048_COOLDOWN_MS ?? 180_000);
  const ms = Math.floor(Number.isFinite(n) ? n : 180_000);
  return Math.max(0, Math.min(86_400_000, ms));
}

export function game2048PowerDays() {
  const n = Number(process.env.GAME2048_POWER_DAYS || process.env.YT_POWER_DAYS || 7);
  return Math.max(1, Math.min(365, Math.floor(Number.isFinite(n) ? n : 7)));
}

/** When the user has not completed daily check-in today, 2048 reward lasts this many hours (default 24). */
export function game2048PowerHoursWhenNoDailyLogin() {
  const n = Number(process.env.GAME2048_POWER_HOURS_NO_CHECKIN || 24);
  const h = Math.floor(Number.isFinite(n) ? n : 24);
  return Math.max(1, Math.min(720, h));
}

/**
 * Full-week boost only after today's paid check-in is confirmed (Brazil calendar day).
 * @param {boolean} checkedInTodayConfirmed
 */
export function rewardDurationFromCheckinToday(checkedInTodayConfirmed) {
  if (checkedInTodayConfirmed) {
    const days = game2048PowerDays();
    return {
      rewardPowerDays: days,
      rewardPowerHours: null,
      rewardTtlMs: days * 86_400_000
    };
  }
  const hours = game2048PowerHoursWhenNoDailyLogin();
  return {
    rewardPowerDays: null,
    rewardPowerHours: hours,
    rewardTtlMs: hours * 3_600_000
  };
}

/** Countdown round length in seconds; 0 disables the timer. */
export function game2048TimeLimitSec() {
  const n = Number(process.env.GAME2048_TIME_LIMIT_SEC ?? 180);
  const v = Math.floor(Number.isFinite(n) ? n : 180);
  return Math.max(0, Math.min(3600, v));
}
