import type { Request, Response } from "express";
import { z } from "zod";
import {
  applyGame2048Move,
  claimGame2048Reward,
  getGame2048Status,
  restartGame2048Session,
  startGame2048Session,
} from "../services/game2048Service.js";

function isApplyMoveOk(x: unknown): x is { ok: true; moved: boolean; session: unknown } {
  return (
    typeof x === "object" &&
    x !== null &&
    "ok" in x &&
    (x as { ok: unknown }).ok === true &&
    "moved" in x &&
    typeof (x as { moved: unknown }).moved === "boolean" &&
    "session" in x &&
    typeof (x as { session: unknown }).session === "object" &&
    (x as { session: unknown }).session !== null
  );
}

function isClaimOk(
  x: unknown
): x is {
  ok: true;
  idempotent: boolean;
  rewardHashRate: number;
  powerDays: number;
  rewardPowerDays: number | null;
  rewardPowerHours: number | null;
  nextClaimAllowedAt: string | null;
  cooldownSecondsRemaining: number;
} {
  return (
    typeof x === "object" &&
    x !== null &&
    "ok" in x &&
    (x as { ok: unknown }).ok === true &&
    "rewardHashRate" in x &&
    typeof (x as { rewardHashRate: unknown }).rewardHashRate === "number" &&
    "powerDays" in x &&
    typeof (x as { powerDays: unknown }).powerDays === "number"
  );
}

const moveBodySchema = z
  .object({
    sessionId: z.coerce.number().int().positive(),
    direction: z.enum(["up", "down", "left", "right"]),
  })
  .strict();

const sessionBodySchema = z
  .object({
    sessionId: z.coerce.number().int().positive(),
  })
  .strict();

function clientMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: typeof req.ip === "string" ? req.ip : null,
    userAgent: typeof req.get === "function" ? req.get("user-agent") || null : null,
  };
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const data = await getGame2048Status(userId);
    res.json(data);
  } catch (e: unknown) {
    console.error("game2048 getStatus", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postStart(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const r = await startGame2048Session(userId);
    if (r.ok === true) {
      res.json({ ok: true, reused: r.reused, session: r.session });
      return;
    }
    res.status(r.status ?? 400).json({
      ok: false,
      code: r.code,
      cooldownEndsAt: r.cooldownEndsAt,
      cooldownSecondsRemaining: r.cooldownSecondsRemaining,
    });
  } catch (e: unknown) {
    console.error("game2048 postStart", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postRestart(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const r = await restartGame2048Session(userId);
    if (r.ok === true) {
      res.json({ ok: true, session: r.session });
      return;
    }
    res.status(r.status ?? 400).json({
      ok: false,
      code: r.code,
      cooldownEndsAt: r.cooldownEndsAt,
      cooldownSecondsRemaining: r.cooldownSecondsRemaining,
    });
  } catch (e: unknown) {
    console.error("game2048 postRestart", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postMove(req: Request, res: Response): Promise<void> {
  try {
    const parsed = moveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY" });
      return;
    }
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const raw: unknown = await applyGame2048Move(userId, parsed.data.sessionId, parsed.data.direction);
    if (!isApplyMoveOk(raw)) {
      const r = raw as Awaited<ReturnType<typeof applyGame2048Move>>;
      const status =
        "status" in r && typeof (r as { status: unknown }).status === "number"
          ? (r as { status: number }).status
          : 400;
      const code =
        "code" in r && typeof (r as { code: unknown }).code === "string"
          ? (r as { code: string }).code
          : "error";
      const session =
        "session" in r && (r as { session: unknown }).session != null
          ? (r as { session: unknown }).session
          : undefined;
      res.status(status).json({
        ok: false,
        code,
        ...(session !== undefined ? { session } : {}),
      });
      return;
    }
    res.json({
      ok: true,
      moved: Boolean(raw.moved),
      session: raw.session,
    });
  } catch (e: unknown) {
    console.error("game2048 postMove", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postClaim(req: Request, res: Response): Promise<void> {
  try {
    const parsed = sessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY" });
      return;
    }
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const raw: unknown = await claimGame2048Reward(userId, parsed.data.sessionId, clientMeta(req));
    if (!isClaimOk(raw)) {
      const r = raw as Awaited<ReturnType<typeof claimGame2048Reward>>;
      const status =
        "status" in r && typeof (r as { status: unknown }).status === "number"
          ? (r as { status: number }).status
          : 400;
      const code =
        "code" in r && typeof (r as { code: unknown }).code === "string"
          ? (r as { code: string }).code
          : "error";
      let cooldownEndsAt: unknown;
      if ("cooldownEndsAt" in r) cooldownEndsAt = (r as { cooldownEndsAt: unknown }).cooldownEndsAt;
      let cooldownSecondsRemaining: unknown;
      if ("cooldownSecondsRemaining" in r) {
        cooldownSecondsRemaining = (r as { cooldownSecondsRemaining: unknown }).cooldownSecondsRemaining;
      }
      res.status(status).json({
        ok: false,
        code,
        cooldownEndsAt,
        cooldownSecondsRemaining,
      });
      return;
    }
    res.json({
      ok: true,
      idempotent: Boolean(raw.idempotent),
      rewardHashRate: raw.rewardHashRate,
      powerDays: raw.powerDays,
      rewardPowerDays: raw.rewardPowerDays,
      rewardPowerHours: raw.rewardPowerHours,
      nextClaimAllowedAt: raw.nextClaimAllowedAt,
      cooldownSecondsRemaining: raw.cooldownSecondsRemaining,
    });
  } catch (e: unknown) {
    console.error("game2048 postClaim", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}
