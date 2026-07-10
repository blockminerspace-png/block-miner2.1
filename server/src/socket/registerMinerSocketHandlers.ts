import { getTokenFromRequest } from "../../utils/token.js";
import { prismaSafeErrorMeta } from "../../utils/prismaSafeError.js";
import { sanitizePublicStateForSocket } from "../../utils/socketStateSanitize.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("MinerSocket");

function safeSocketPublicState(engine, minerId) {
  const raw = engine.getPublicState(minerId);
  return sanitizePublicStateForSocket(raw) ?? raw;
}

export function registerMinerSocketHandlers({
  io,
  engine,
  verifyAccessToken,
  getUserById,
  getOrCreateMinerProfile,
  syncUserBaseHashRate,
  persistMinerProfile,
  buildPublicState
}) {
  io.on("connection", (socket) => {
    socket.on("miner:join", async (payload: unknown, callback) => {
      try {
        const p = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
        const tokenRaw = p.token;
        const token = typeof tokenRaw === "string" ? tokenRaw : undefined;
        const explicitToken = typeof token === "string" && token.split(".").length === 3 ? token : null;
        const requestLike = { headers: socket.request?.headers || {} };
        const authToken = explicitToken || getTokenFromRequest(requestLike);

        if (!authToken) {
          socket.emit("auth:expired");
          callback?.({ ok: false, code: "AUTH_EXPIRED", message: "Sessao invalida. Faça login novamente." });
          return;
        }

        const jwtPayload = verifyAccessToken(authToken);
        const userId = Number(jwtPayload?.sub);
        if (!userId) {
          socket.emit("auth:expired");
          callback?.({ ok: false, code: "AUTH_EXPIRED", message: "Sessao invalida. Faça login novamente." });
          return;
        }

        const user = await getUserById(userId);
        if (!user) {
          socket.emit("auth:expired");
          callback?.({ ok: false, code: "AUTH_EXPIRED", message: "Sessão inválida. Faça login novamente." });
          return;
        }

        const profile = await getOrCreateMinerProfile(user);
        if (syncUserBaseHashRate) {
          await syncUserBaseHashRate(user.id);
        }

        const miner = engine.createOrGetMiner({
          userId: user.id,
          username: profile.username || user.name,
          walletAddress: profile.walletAddress ?? null,
          profile: {
            rigs: profile.rigs,
            base_hash_rate: profile.base_hash_rate,
            balance: profile.balance,
            lifetimeMined: profile.lifetime_mined,
            refCode: profile.refCode,
            referralCount: profile.referralCount,
            mining_payout_mode: profile.mining_payout_mode,
            mining_allocation_pol_bps: profile.mining_allocation_pol_bps
          }
        });

        engine.setConnected(miner.id, true);
        socket.data.minerId = miner.id;
        socket.data.userId = user.id;
        socket.join(`user:${user.id}`);

        if (buildPublicState) {
          const state = await buildPublicState(miner.id);
          const safeState = sanitizePublicStateForSocket(state);
          if (!safeState) {
            callback?.({ ok: false, message: "Estado inválido. Atualize a página." });
            return;
          }
          callback?.({ ok: true, minerId: miner.id, state: safeState });
        } else {
          const raw = engine.getPublicState(miner.id);
          const safeState = sanitizePublicStateForSocket(raw);
          if (!safeState) {
            callback?.({ ok: false, message: "Estado inválido. Atualize a página." });
            return;
          }
          callback?.({ ok: true, minerId: miner.id, state: safeState });
        }
      } catch (error) {
        const meta = prismaSafeErrorMeta(error);
        logger.error("miner:join failed", { error: String(meta) });
        callback?.({ ok: false, message: "Não foi possível carregar sua sala de mineração." });
      }
    });

    socket.on("miner:toggle", async (payload: unknown, callback) => {
      const p = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
      const active = Boolean(p.active);
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      const miner = engine.setActive(minerId, active);
      if (persistMinerProfile && miner) {
        try {
          await persistMinerProfile(miner);
        } catch (error) {
          logger.error("miner:toggle persist failed", { error: String(prismaSafeErrorMeta(error)) });
        }
      }
      callback?.({ ok: true, state: safeSocketPublicState(engine, minerId) });
    });

    socket.on("miner:boost", (_payload, callback) => {
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      const result = engine.applyBoost(minerId);
      callback?.({ ...result, state: safeSocketPublicState(engine, minerId) });
    });

    socket.on("miner:upgrade-rig", async (_payload, callback) => {
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      const result = engine.upgradeRig(minerId);
      if (result?.ok) {
        const miner = engine.miners.get(minerId);
        if (persistMinerProfile && miner) {
          try {
            await persistMinerProfile(miner);
          } catch (error) {
            logger.error("miner:upgrade-rig persist failed", { error: String(prismaSafeErrorMeta(error)) });
          }
        }
      }
      callback?.({ ...result, state: safeSocketPublicState(engine, minerId) });
    });

    socket.on("miner:wallet-link", async (payload: unknown, callback) => {
      const p = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
      const walletAddress = typeof p.walletAddress === "string" ? p.walletAddress : undefined;
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      if (typeof walletAddress !== "string" || !walletAddress.trim()) {
        callback?.({ ok: false, message: "Carteira inválida." });
        return;
      }

      const miner = engine.setWallet(minerId, walletAddress);
      if (persistMinerProfile && miner) {
        try {
          await persistMinerProfile(miner);
        } catch (error) {
          logger.error("miner:wallet-link persist failed", { error: String(prismaSafeErrorMeta(error)) });
        }
      }
      callback?.({
        ok: true,
        message: "Carteira conectada para depósito e saque.",
        state: safeSocketPublicState(engine, minerId)
      });
    });

    socket.on("disconnect", async () => {
      const minerId = socket.data.minerId;
      if (minerId) {
        const miner = engine.miners.get(minerId);
        if (persistMinerProfile && miner) {
          try {
            await persistMinerProfile(miner);
          } catch (error) {
            logger.error("miner:disconnect persist failed", { error: String(prismaSafeErrorMeta(error)) });
          }
        }
        engine.setConnected(minerId, false);
      }
    });
  });
}
