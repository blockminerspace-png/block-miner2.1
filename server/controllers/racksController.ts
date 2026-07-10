import type { Request, Response } from "express";
import * as rackModel from "../models/rackModel.js";

import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("racksController");

const RACK_NAME_REGEX = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 -]*$/;

type UpdateRackBody = {
  rackIndex?: unknown;
  customName?: unknown;
};

export async function listRacks(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const racks = await rackModel.listRacks(req.user.id);
    res.json({ ok: true, racks });
  } catch (error: unknown) {
    logger.error("Error loading racks:", { error: String(error) });
    res.status(500).json({ ok: false, message: "Unable to load racks." });
  }
}

export async function updateRack(req: Request<unknown, unknown, UpdateRackBody>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const rackIndex = Number(req.body?.rackIndex);
    const customName = String(req.body?.customName || "").trim();

    if (!Number.isInteger(rackIndex) || rackIndex < 1) {
      res.status(400).json({ ok: false, message: "Invalid rack index." });
      return;
    }

    if (!customName || customName.length > 30 || !RACK_NAME_REGEX.test(customName)) {
      res.status(400).json({ ok: false, message: "Invalid rack name." });
      return;
    }

    await rackModel.upsertRackName(req.user.id, rackIndex, customName);
    res.json({ ok: true, message: "Rack name updated successfully." });
  } catch (error: unknown) {
    logger.error("Error updating rack:", { error: String(error) });
    res.status(500).json({ ok: false, message: "Unable to update rack." });
  }
}
