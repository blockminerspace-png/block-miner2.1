import { ZodError } from "zod";
import loggerLib from "../utils/logger.js";
import { REDEEM_ALREADY, REDEEM_GENERIC } from "../utils/readEarnConstants.js";
import { parseReadEarnRedeem } from "../utils/readEarnSchemas.js";
import { listPublicReadEarnCampaigns, redeemReadEarnCampaign } from "../services/readEarnService.js";

const logger = loggerLib.child("ReadEarnController");

export async function getPublicReadEarnCampaigns(_req, res) {
  try {
    const campaigns = await listPublicReadEarnCampaigns();
    res.json({ ok: true, campaigns });
  } catch (e) {
    logger.error("getPublicReadEarnCampaigns", { err: e?.message });
    res.status(500).json({ ok: false, message: "Failed to load campaigns." });
  }
}

export async function postReadEarnRedeem(req, res) {
  try {
    const body = parseReadEarnRedeem(req.body || {});
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, code: REDEEM_GENERIC, message: "Session invalid." });
    }

    const ip = req.ip || null;
    const userAgent = req.headers["user-agent"] || null;

    const result = await redeemReadEarnCampaign({
      userId,
      campaignId: body.campaignId,
      rawCode: body.code,
      ip,
      userAgent,
      logger
    });

    if (!result.ok) {
      const status = result.code === REDEEM_ALREADY ? 409 : 400;
      return res.status(status).json({
        ok: false,
        code: result.code,
        message: result.code
      });
    }

    res.json({
      ok: true,
      code: "OK",
      reward: result.reward
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(400).json({ ok: false, code: REDEEM_GENERIC, message: "Invalid request." });
    }
    logger.error("postReadEarnRedeem", { err: e?.message });
    res.status(500).json({ ok: false, code: REDEEM_GENERIC, message: "Redeem failed." });
  }
}
