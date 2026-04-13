/** Slug for `Game` row tied to Chain 2048 temporary hashrate. */
export const GAME2048_GAME_SLUG = "block-2048";

export function game2048WinTile() {
  const n = Number(process.env.GAME2048_WIN_TILE || 2048);
  const v = Math.floor(Number.isFinite(n) ? n : 2048);
  return Math.max(8, Math.min(131072, v));
}

export function game2048MinScore() {
  const n = Number(process.env.GAME2048_MIN_SCORE || 0);
  return Math.max(0, Math.min(10_000_000, Math.floor(Number.isFinite(n) ? n : 0)));
}

export function game2048RewardHashRate() {
  const n = Number(process.env.GAME2048_REWARD_HASHRATE || 50);
  return Math.max(1, Math.min(100_000, Number.isFinite(n) ? n : 50));
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
