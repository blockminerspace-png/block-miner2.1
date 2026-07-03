/**
 * gameVerifyStorage — persisted hand-off between a game page and /games/verify.
 *
 * When a match ends, the game page writes a record here and navigates to
 * `/games/verify` (RollerCoin-style full page, rendered inside the normal
 * app layout). The verify page reads the record, runs the validation
 * animation, resolves/claims the reward and persists the final resolution.
 *
 * Reload safety (never count a reward twice):
 * - Socket games: the reward is granted server-side BEFORE navigation; the
 *   record already carries the final resolution and the verify page never
 *   triggers a grant. Reloading just re-renders the persisted result.
 * - 2048: the record carries a claim descriptor; the claim endpoint is
 *   idempotent server-side (`rewardGranted` short-circuit). Once resolved,
 *   the resolution is persisted so a reload skips straight to the result.
 */

import type { GameFlowResolution, GameFlowStat } from "./types";

const STORAGE_KEY = "bm.gameVerify.v1";
/** Records older than this are considered stale and dropped. */
const MAX_AGE_MS = 10 * 60 * 1000;

export interface GameVerifyClaim {
  kind: "game2048";
  sessionId: number | string;
}

export interface GameVerifyRecord {
  createdAt: number;
  /** Cooldown-store key ("memory", "match-3", "2048", …). */
  gameKey: string;
  /** i18n key for the game title shown above the result. */
  gameLabelKey: string;
  /** Route for the "play again" button. */
  playAgainPath: string;
  stats: GameFlowStat[];
  /** Pending server claim (2048 only) — executed once by the verify page. */
  claim: GameVerifyClaim | null;
  /** Final resolution; present immediately for socket games, filled in after claim for 2048. */
  resolution: GameFlowResolution | null;
  /** Epoch ms when the play-again cooldown expires (survives reloads). */
  cooldownUntil: number | null;
  /** Set once the validation animation completed — reloads skip straight to the result. */
  validatedAt: number | null;
}

export interface SaveGameVerifyInput {
  gameKey: string;
  gameLabelKey: string;
  playAgainPath: string;
  stats: GameFlowStat[];
  claim?: GameVerifyClaim | null;
  resolution?: GameFlowResolution | null;
  cooldownSeconds?: number;
}

export function saveGameVerifyRecord(input: SaveGameVerifyInput): void {
  const cooldownSeconds = Math.max(0, Math.floor(input.cooldownSeconds ?? 0));
  const record: GameVerifyRecord = {
    createdAt: Date.now(),
    gameKey: input.gameKey,
    gameLabelKey: input.gameLabelKey,
    playAgainPath: input.playAgainPath,
    stats: input.stats,
    claim: input.claim ?? null,
    resolution: input.resolution ?? null,
    cooldownUntil: cooldownSeconds > 0 ? Date.now() + cooldownSeconds * 1000 : null,
    validatedAt: null,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable (private mode) — verify page will fall back to /games */
  }
}

export function loadGameVerifyRecord(): GameVerifyRecord | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as GameVerifyRecord;
    if (!rec || typeof rec !== "object") return null;
    if (typeof rec.createdAt !== "number" || typeof rec.playAgainPath !== "string") return null;
    if (Date.now() - rec.createdAt > MAX_AGE_MS) {
      clearGameVerifyRecord();
      return null;
    }
    return {
      ...rec,
      stats: Array.isArray(rec.stats) ? rec.stats : [],
      claim: rec.claim ?? null,
      resolution: rec.resolution ?? null,
      cooldownUntil: typeof rec.cooldownUntil === "number" ? rec.cooldownUntil : null,
      validatedAt: typeof rec.validatedAt === "number" ? rec.validatedAt : null,
    };
  } catch {
    return null;
  }
}

export function updateGameVerifyRecord(patch: Partial<GameVerifyRecord>): GameVerifyRecord | null {
  const current = loadGameVerifyRecord();
  if (!current) return null;
  const next: GameVerifyRecord = { ...current, ...patch };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* keep in-memory copy usable even if persistence fails */
  }
  return next;
}

export function clearGameVerifyRecord(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
