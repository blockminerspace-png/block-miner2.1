import type { Request, Response } from "express";
import { getHealthPayload } from "./health.service.js";

export function health(_req: Request, res: Response): void {
  res.json(getHealthPayload());
}
