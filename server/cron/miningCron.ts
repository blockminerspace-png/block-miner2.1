import loggerLib from "../utils/logger.js";
import { sanitizePublicStateForSocket } from "../utils/socketStateSanitize.js";
import { createCronActionRunner } from "./cronActionRunner.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("MiningCron");

const DEFAULT_TICK_MS = 1000;
const DEFAULT_PERSIST_MS = 15000;
const DEFAULT_HASHRATE_SYNC_MS = 60_000;

export type MiningEngineLike = {
  miners: { values: () => Iterable<{ userId?: unknown; id?: unknown; connected?: boolean; baseHashRate?: number }> };
  tickAsync: () => Promise<void>;
  getPublicState: (id?: unknown) => unknown;
};

export type MiningIoLike = {
  emit?: (event: string, ...args: unknown[]) => unknown;
  to: (room: string) => { emit: (event: string, payload: unknown) => void };
  except: (rooms: string[]) => { emit: (event: string, payload: unknown) => void };
};

export type MiningLoopOptions = {
  tickMs?: number;
  persistMs?: number;
  hashrateSyncMs?: number;
  syncEngineMiners?: unknown;
  syncUserBaseHashRate?: (userId: number) => Promise<number> | number;
};

export type StartMiningLoopArgs = {
  engine: MiningEngineLike;
  io: MiningIoLike;
  persistMinerProfile: (miner: unknown) => unknown;
  buildPublicState?: (id?: unknown) => Promise<unknown> | unknown;
};

export async function refreshKnownMinerHashrates({
  engine,
  syncUserBaseHashRate,
}: {
  engine: MiningEngineLike;
  syncUserBaseHashRate: (userId: number) => Promise<number> | number;
}): Promise<{ refreshed: number; changed: number }> {
  if (!engine || typeof syncUserBaseHashRate !== "function") {
    return { refreshed: 0, changed: 0 };
  }

  const seen = new Set<number>();
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
        nextHashrate,
      });
    }
  }

  return { refreshed, changed };
}

type MiningTickSanitized = { hasPublicStateBuilder: boolean };

export function startMiningLoop(
  { engine, io, persistMinerProfile, buildPublicState }: StartMiningLoopArgs,
  options: MiningLoopOptions = {},
): { tickTimer: ReturnType<typeof setInterval>; persistTimer: ReturnType<typeof setInterval>; hashrateSyncTimer: ReturnType<typeof setInterval> } {
  const tickMs = Number(options.tickMs || DEFAULT_TICK_MS);
  const persistMs = Number(options.persistMs || DEFAULT_PERSIST_MS);
  const hashrateSyncMs = Number(
    options.hashrateSyncMs || process.env.MINING_HASHRATE_SYNC_MS || DEFAULT_HASHRATE_SYNC_MS,
  );
  const runCronAction = createCronActionRunner({ logger, cronName: "MiningCron" });

  const tick = async () => {
    const result = await runCronAction({
      action: "mining_tick",
      logStart: false,
      logSuccess: false,
      skippedLogLevel: "debug",
      validateFailureLogLevel: "debug",
      validate: async () => {
        if (!engine || typeof engine.tickAsync !== "function") return { ok: false, reason: "invalid_engine" };
        if (!io || typeof io.emit !== "function") return { ok: false, reason: "invalid_socket_io" };
        return { ok: true };
      },
      sanitize: async () => ({ hasPublicStateBuilder: typeof buildPublicState === "function" }),
      execute: async (sanitized) => {
        const { hasPublicStateBuilder } = sanitized as MiningTickSanitized;
        await engine.tickAsync();

        const activeUserRooms: string[] = [];

        for (const miner of engine.miners.values()) {
          if (miner.connected) {
            const roomName = `user:${miner.userId}`;
            activeUserRooms.push(roomName);

            const userState =
              hasPublicStateBuilder && typeof buildPublicState === "function"
                ? await buildPublicState(miner.id)
                : engine.getPublicState(miner.id);
            const safeUserState = sanitizePublicStateForSocket(userState);
            if (safeUserState) {
              io.to(roomName).emit("state:update", safeUserState);
            }
          }
        }

        const globalState =
          hasPublicStateBuilder && typeof buildPublicState === "function"
            ? await buildPublicState()
            : engine.getPublicState();
        const safeGlobal = sanitizePublicStateForSocket(globalState);
        if (safeGlobal) {
          io.except(activeUserRooms).emit("state:update", safeGlobal);
        }

        return { emitted: true };
      },
      confirm: async ({ executionResult }) => ({
        ok: Boolean((executionResult as { emitted?: boolean } | undefined)?.emitted),
        reason: (executionResult as { emitted?: boolean } | undefined)?.emitted ? undefined : "state_not_emitted",
      }),
    });
    return result;
  };

  const tickTimer = setInterval(() => {
    tick().catch((error: unknown) => {
      logger.error("Mining tick unexpected error", { error: errMsg(error) });
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
      execute: async () => {
        const syncUserBaseHashRate = options.syncUserBaseHashRate;
        if (typeof syncUserBaseHashRate !== "function") {
          return { refreshed: 0, changed: 0 };
        }
        return refreshKnownMinerHashrates({
          engine,
          syncUserBaseHashRate,
        });
      },
      confirm: async ({ executionResult }) => ({
        ok: Boolean(executionResult),
        details: executionResult as Record<string, unknown>,
      }),
    });
  };

  const hashrateSyncTimer = setInterval(() => {
    syncHashrates().catch((error: unknown) => {
      logger.error("Mining hashrate sync unexpected error", { error: errMsg(error) });
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
