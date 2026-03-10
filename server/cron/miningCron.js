import loggerLib from "../utils/logger.js";
import { createCronActionRunner } from "./cronActionRunner.js";

const logger = loggerLib.child("MiningCron");

const DEFAULT_TICK_MS = 1000;
const DEFAULT_PERSIST_MS = 15000;

export function startMiningLoop({ engine, io, persistMinerProfile, buildPublicState }, options = {}) {
  const tickMs = Number(options.tickMs || DEFAULT_TICK_MS);
  const persistMs = Number(options.persistMs || DEFAULT_PERSIST_MS);
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

  const persist = async () => {
    const miners = [...engine.miners.values()];
    const saves = miners.map((miner) => persistMinerProfile(miner));
    await Promise.allSettled(saves);
  };

  const persistTimer = setInterval(persist, persistMs);

  return { tickTimer, persistTimer };
}
