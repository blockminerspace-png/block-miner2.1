/**
 * Game termination flow — shared types.
 *
 * RollerCoin-style experience: when a match ends, the game page hands off to
 * the dedicated /games/verify page (rendered inside the normal app layout,
 * with sidebar + navbar) via gameVerifyStorage. No overlay/popup is ever
 * shown on top of the game.
 */

/** Server-reported outcome once validation resolves. */
export type GameValidationOutcome = "success" | "failure" | "rejected";

/** A single metric line shown in the result panel (label + value). */
export interface GameFlowStat {
  label: string;
  value: string;
}

/** Server-validated resolution. */
export interface GameFlowResolution {
  outcome: GameValidationOutcome;
  /** Human readable reward string (success only). */
  rewardMessage?: string | null;
  /** Cooldown (seconds) until the user may play again. */
  cooldownSeconds: number;
  /** Replaces the captured stats if the server returns the authoritative ones. */
  stats?: GameFlowStat[];
  /** Optional failure reason key/code, surfaced neutrally to the user. */
  reasonKey?: string | null;
  /** Optional localized failure message. */
  reasonMessage?: string | null;
}
