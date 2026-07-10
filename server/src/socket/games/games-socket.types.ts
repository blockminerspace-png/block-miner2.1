/** Per-socket game session (memory, match-3, cart-rush); extra fields vary by `slug`. */
export type GameSessionState = {
  gameId: number;
  slug: string;
  userId: number;
  score: number;
  isFinished: boolean;
  startTime: number;
  lastUpdate: number;
} & Record<string, unknown>;

export type MemoryCard = { id: number; symbol: string; isFlipped: boolean; isMatched: boolean };

/** Narrow shape for cart-rush tick loop (extra fields on session). */
export type CartRushCartEvent = {
  id: string;
  lane: number;
  kind: string;
  progress: number;
  speed: number;
  variant?: unknown;
  checked?: boolean;
};

export type CartRushState = GameSessionState & {
  slug: "cart-rush";
  lane: number;
  health: number;
  events: CartRushCartEvent[];
  spawnCooldownMs: number;
  distance: number;
  elapsedMs: number;
  btcCount: number;
  roadSpeed: number;
  cartTickTimer?: ReturnType<typeof setInterval>;
};

export type BlockStackState = GameSessionState & {
  slug: "block-stack";
  blocksPlaced: number;
  currentWidth: number;
  currentTravelMs: number;
  blockStartedAt: number;
  baseLeftPx: number;
  lastDropAt: number;
};

export type SkyRunnerState = GameSessionState & {
  slug: "sky-runner";
  seed: string;
  lives: number;
  pipesPassed: number;
  lastCheckpointMs: number;
  lastFlapAt: number;
};
