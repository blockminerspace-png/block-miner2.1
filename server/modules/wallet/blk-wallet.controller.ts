import type { Request, Response } from "express";
import loggerLib from "../../utils/logger.js";
import { getBlkEconomyConfig, serializeBlkConfigPublic, updateBlkEconomyConfig } from "../../models/blkEconomyModel.js";
import { estimatePolToBlk } from "../../models/blkWalletModel.js";

const logger = loggerLib.child("BlkWalletController");

type PolQuery = { pol?: string; pol_amount?: string };

export async function getEconomy(_req: Request, res: Response): Promise<void> {
  try {
    const row = await getBlkEconomyConfig();
    res.json({ ok: true, economy: serializeBlkConfigPublic(row) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("getEconomy", { error: msg });
    res.status(500).json({ ok: false, message: "Unable to load BLK settings." });
  }
}

export async function getEstimate(req: Request<unknown, unknown, unknown, PolQuery>, res: Response): Promise<void> {
  try {
    const pol = req.query.pol ?? req.query.pol_amount;
    const row = await getBlkEconomyConfig();
    const est = estimatePolToBlk(row, pol);
    if (!est) {
      res.status(400).json({ ok: false, message: "Invalid pol amount" });
      return;
    }
    res.json({ ok: true, estimate: est });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("getEstimate", { error: msg });
    res.status(500).json({ ok: false, message: "Estimate failed." });
  }
}

export async function postConvert(req: Request, res: Response): Promise<void> {
  logger.warn("postConvert disabled", { userId: req.user?.id });
  res.status(410).json({
    ok: false,
    message: "POL to BLK conversion is no longer available.",
  });
}

/** Admin: full config row + serialized (admin panel) */
export async function adminGetEconomy(_req: Request, res: Response): Promise<void> {
  try {
    const row = await getBlkEconomyConfig();
    res.json({ ok: true, config: row, economy: serializeBlkConfigPublic(row) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, message: msg });
  }
}

export async function adminPutEconomy(req: Request<unknown, unknown, Record<string, unknown>>, res: Response): Promise<void> {
  try {
    const row = await updateBlkEconomyConfig(req.body || {});
    res.json({ ok: true, config: row, economy: serializeBlkConfigPublic(row) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    res.status(400).json({ ok: false, message: msg || "Update failed" });
  }
}
