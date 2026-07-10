import type { Request, Response } from "express";
import { buildOpsSnapshot } from "../../../shared/observability/opsSnapshot.js";
import loggerLib from "../../../utils/logger.js";
import { errMsg } from "../../../types/tsNarrowing.js";

const logger = loggerLib.child("AdminOps");

export async function getOpsSnapshot(_req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await buildOpsSnapshot();
    res.json({ ok: true, snapshot });
  } catch (error: unknown) {
    logger.error("getOpsSnapshot failed", { error: errMsg(error) });
    res.status(500).json({ ok: false, message: "Unable to load operations snapshot." });
  }
}
