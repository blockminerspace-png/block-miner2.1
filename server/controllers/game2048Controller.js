import { z } from "zod";
import {
  applyGame2048Move,
  claimGame2048Reward,
  getGame2048Status,
  restartGame2048Session,
  startGame2048Session
} from "../services/game2048Service.js";

const moveBodySchema = z
  .object({
    sessionId: z.coerce.number().int().positive(),
    direction: z.enum(["up", "down", "left", "right"])
  })
  .strict();

const sessionBodySchema = z
  .object({
    sessionId: z.coerce.number().int().positive()
  })
  .strict();

function clientMeta(req) {
  return {
    ip: req.ip || null,
    userAgent: typeof req.get === "function" ? req.get("user-agent") || null : null
  };
}

export async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    const data = await getGame2048Status(userId);
    res.json(data);
  } catch (e) {
    console.error("game2048 getStatus", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postStart(req, res) {
  try {
    const userId = req.user.id;
    const r = await startGame2048Session(userId);
    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        code: r.code,
        cooldownEndsAt: r.cooldownEndsAt,
        cooldownSecondsRemaining: r.cooldownSecondsRemaining
      });
    }
    res.json({ ok: true, reused: r.reused, session: r.session });
  } catch (e) {
    console.error("game2048 postStart", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postRestart(req, res) {
  try {
    const userId = req.user.id;
    const r = await restartGame2048Session(userId);
    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        code: r.code,
        cooldownEndsAt: r.cooldownEndsAt,
        cooldownSecondsRemaining: r.cooldownSecondsRemaining
      });
    }
    res.json({ ok: true, session: r.session });
  } catch (e) {
    console.error("game2048 postRestart", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postMove(req, res) {
  try {
    const parsed = moveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, code: "INVALID_BODY" });
    }
    const userId = req.user.id;
    const r = await applyGame2048Move(userId, parsed.data.sessionId, parsed.data.direction);
    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        code: r.code,
        ...(r.session ? { session: r.session } : {})
      });
    }
    res.json({
      ok: true,
      moved: Boolean(r.moved),
      session: r.session
    });
  } catch (e) {
    console.error("game2048 postMove", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postClaim(req, res) {
  try {
    const parsed = sessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, code: "INVALID_BODY" });
    }
    const userId = req.user.id;
    const r = await claimGame2048Reward(userId, parsed.data.sessionId, clientMeta(req));
    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        code: r.code,
        cooldownEndsAt: r.cooldownEndsAt,
        cooldownSecondsRemaining: r.cooldownSecondsRemaining
      });
    }
    res.json({
      ok: true,
      idempotent: Boolean(r.idempotent),
      rewardHashRate: r.rewardHashRate,
      powerDays: r.powerDays,
      nextClaimAllowedAt: r.nextClaimAllowedAt,
      cooldownSecondsRemaining: r.cooldownSecondsRemaining
    });
  } catch (e) {
    console.error("game2048 postClaim", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}
