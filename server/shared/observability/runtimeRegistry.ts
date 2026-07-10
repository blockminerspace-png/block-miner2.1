import type { Server } from "socket.io";
import type { MiningEngine } from "../../src/miningEngine.js";

let socketIo: Server | null = null;
let miningEngine: MiningEngine | null = null;
let cronStartedAt: number | null = null;

export function setObservabilitySocketIo(io: Server | null): void {
  socketIo = io;
}

export function getObservabilitySocketIo(): Server | null {
  return socketIo;
}

export function setObservabilityMiningEngine(engine: MiningEngine | null): void {
  miningEngine = engine;
}

export function getObservabilityMiningEngine(): MiningEngine | null {
  return miningEngine;
}

export function markCronSchedulerStarted(): void {
  cronStartedAt = Date.now();
}

export function getCronSchedulerStartedAt(): number | null {
  return cronStartedAt;
}
