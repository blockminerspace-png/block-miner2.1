/**
 * Whether a season row is visible and inside its marketing window (active flag + soft-delete + dates).
 */
export function isMiniPassSeasonLive(season, now = new Date()) {
  if (!season || season.deletedAt) return false;
  if (!season.isActive) return false;
  const t = now.getTime();
  return t >= season.startsAt.getTime() && t <= season.endsAt.getTime();
}
