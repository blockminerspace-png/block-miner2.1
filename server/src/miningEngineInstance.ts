import type { MiningEngine } from "./miningEngine.js";

let engineInstance: MiningEngine | null = null;

export function setMiningEngine(engine: MiningEngine | null): void {
  engineInstance = engine;
}

export function getMiningEngine(): MiningEngine | null {
  return engineInstance;
}
