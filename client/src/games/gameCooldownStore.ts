/**
 * Module-level cooldown store shared between GameSessionPage and the hub.
 * GameSessionPage writes cooldowns on game:finished; the hub reads them to
 * disable/label cards without a socket connection.
 *
 * Survives React re-renders but resets on full page reload (same as the
 * previous socket-state-based approach).
 */

const expiresAt: Record<string, number> = {};

export function setGameCooldown(game: string, seconds: number): void {
  if (seconds > 0) {
    expiresAt[game] = Date.now() + seconds * 1000;
  } else {
    delete expiresAt[game];
  }
}

export function getGameCooldownSeconds(game: string): number {
  const exp = expiresAt[game];
  if (!exp) return 0;
  return Math.max(0, Math.ceil((exp - Date.now()) / 1000));
}
