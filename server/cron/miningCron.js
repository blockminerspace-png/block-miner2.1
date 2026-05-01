import loggerLib from "../utils/logger.js";
import { createCronActionRunner } from "./cronActionRunner.js";

const logger = loggerLib.child("MiningCron");

const DEFAULT_TICK_MS = 1000;
const DEFAULT_PERSIST_MS = 15000;
const DEFAULT_HASHRATE_SYNC_MS = 60_000;

export async function refreshKnownMinerHashrates({ engine, syncUserBaseHashRate }) {
  if (!engine || typeof syncUserBaseHashRate !== "function") {
    return { refreshed: 0, changed: 0 };
  }

  const seen = new Set();
  let refreshed = 0;
  let changed = 0;

  for (const miner of engine.miners.values()) {
    const userId = Number(miner?.userId);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);

    const nextHashrate = Number(await syncUserBaseHashRate(userId)) || 0;
    const previousHashrate = Number(miner.baseHashRate || 0);
    miner.baseHashRate = nextHashrate;
    refreshed += 1;

    if (Math.abs(previousHashrate - nextHashrate) > 1e-9) {
      changed += 1;
      logger.info("Mining hashrate refreshed", {
        userId,
        previousHashrate,
        nextHashrate
      });
    }
  }

  return { refreshed, changed };
}

export function startMiningLoop({ engine, io, persistMinerProfile, buildPublicState }, options = {}) {
  const tickMs = Number(options.tickMs || DEFAULT_TICK_MS);
  const persistMs = Number(options.persistMs || DEFAULT_PERSIST_MS);
  const hashrateSyncMs = Number(options.hashrateSyncMs || process.env.MINING_HASHRATE_SYNC_MS || DEFAULT_HASHRATE_SYNC_MS);
  const runCronAction = createCronActionRunner({ logger, cronName: "MiningCron" });

  const tick = async () => {
    const result = await runCronAction({
      action: "mining_tick",
      logStart: false,
      logSuccess: false,
      skippedLogLevel: "debug",
      validateFailureLogLevel: "debug",
      validate: async () => {
        if (!engine || typeof engine.tick !== "function") return { ok: false, reason: "invalid_engine" };
        if (!io || typeof io.emit !== "function") return { ok: false, reason: "invalid_socket_io" };
        return { ok: true };
      },
      sanitize: async () => ({ hasPublicStateBuilder: typeof buildPublicState === "function" }),
      execute: async ({ hasPublicStateBuilder }) => {
        engine.tick();
        
        const activeUserRooms = [];
        
        // 1. Envia atualizações personalizadas para usuários conectados
        // Isso garante que eles recebam o "userReward" real do histórico
        for (const miner of engine.miners.values()) {
          if (miner.connected) {
            const roomName = `user:${miner.userId}`;
            activeUserRooms.push(roomName);
            
            const userState = hasPublicStateBuilder ? await buildPublicState(miner.id) : engine.getPublicState(miner.id);
            if (userState) {
              io.to(roomName).emit("state:update", userState);
            }
          }
        }

        // 2. Envia o estado global APENAS para quem não está em uma sala de usuário (visitantes)
        // O uso de .except() impede que a atualização global (com zeros) chegue aos mineradores
        const globalState = hasPublicStateBuilder ? await buildPublicState() : engine.getPublicState();
        io.except(activeUserRooms).emit("state:update", globalState);

        return { emitted: true };
      },
      confirm: async ({ executionResult }) => ({
        ok: Boolean(executionResult?.emitted),
        reason: executionResult?.emitted ? null : "state_not_emitted"
      })
    });
    return result;
  };

  const tickTimer = setInterval(() => {
    tick().catch((error) => {
      logger.error("Mining tick unexpected error", { error: error.message });
    });
  }, tickMs);

  const syncHashrates = async () => {
    return runCronAction({
      action: "mining_hashrate_sync",
      logStart: false,
      logSuccess: false,
      skippedLogLevel: "debug",
      validateFailureLogLevel: "debug",
      validate: async () => {
        if (!engine?.miners || typeof engine.miners.values !== "function") {
          return { ok: false, reason: "invalid_engine" };
        }
        if (typeof options.syncUserBaseHashRate !== "function") {
          return { ok: false, reason: "missing_hashrate_sync" };
        }
        return { ok: true };
      },
      execute: async () =>
        refreshKnownMinerHashrates({
          engine,
          syncUserBaseHashRate: options.syncUserBaseHashRate
        }),
      confirm: async ({ executionResult }) => ({
        ok: Boolean(executionResult),
        details: executionResult
      })
    });
  };

  const hashrateSyncTimer = setInterval(() => {
    syncHashrates().catch((error) => {
      logger.error("Mining hashrate sync unexpected error", { error: error.message });
    });
  }, hashrateSyncMs);

  const persist = async () => {
    const miners = [...engine.miners.values()];
    const saves = miners.map((miner) => persistMinerProfile(miner));
    await Promise.allSettled(saves);
  };

  const persistTimer = setInterval(persist, persistMs);

  return { tickTimer, persistTimer, hashrateSyncTimer };
}
