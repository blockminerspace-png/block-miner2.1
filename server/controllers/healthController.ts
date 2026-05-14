import type { Request, Response } from "express";

export function health(_req: Request, res: Response): void {
  res.json({ ok: true, message: "BlockMiner online" });
}
