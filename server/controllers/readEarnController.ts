import type { Request, Response } from "express";
import { ZodError } from "zod";
import loggerLib from "../utils/logger.js";
import { REDEEM_ALREADY, REDEEM_GENERIC } from "../utils/readEarnConstants.js";
import { parseReadEarnRedeem } from "../utils/readEarnSchemas.js";
import { listPublicReadEarnCampaigns, redeemReadEarnCampaign } from "../services/readEarnService.js";

const logger = loggerLib.child("ReadEarnController");

export async function getPublicReadEarnCampaigns(_req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await listPublicReadEarnCampaigns();
    res.json({ ok: true, campaigns });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("getPublicReadEarnCampaigns", { err: msg });
    res.status(500).json({ ok: false, message: "Failed to load campaigns." });
  }
}

export async function postReadEarnRedeem(req: Request, res: Response): Promise<void> {
  try {
    const body = parseReadEarnRedeem(req.body || {});
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, code: REDEEM_GENERIC, message: "Session invalid." });
      return;
    }

    const ip = req.ip || null;
    const userAgent = req.headers["user-agent"] || null;

    const result = await redeemReadEarnCampaign({
      userId,
      campaignId: body.campaignId,
      rawCode: body.code,
      ip,
      userAgent,
      logger: {
        error: (msg: string, meta?: object) =>
          logger.error(msg, meta as Record<string, unknown> | undefined),
      },
    });

    if (!result.ok) {
      const status = result.code === REDEEM_ALREADY ? 409 : 400;
      res.status(status).json({
        ok: false,
        code: result.code,
        message: result.code,
      });
      return;
    }

    res.json({
      ok: true,
      code: "OK",
      reward: result.reward,
    });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      res.status(400).json({ ok: false, code: REDEEM_GENERIC, message: "Invalid request." });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("postReadEarnRedeem", { err: msg });
    res.status(500).json({ ok: false, code: REDEEM_GENERIC, message: "Redeem failed." });
  }
}
