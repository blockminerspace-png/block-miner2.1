import type { Request, Response } from "express";
import {
  computeWeekSummary,
  payDailyTax,
  EnergyTaxAlreadyPaid,
  EnergyTaxNoRewards,
  EnergyTaxInsufficientBalance,
  EnergyTaxNotStarted,
} from "./energyTax.service.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("energyTax.controller");

export async function getSummary(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ ok: false, message: "Não autenticado." });
    return;
  }
  try {
    const summary = await computeWeekSummary(userId);
    res.json({ ok: true, ...summary });
  } catch (err) {
    logger.error("[energy-tax summary]", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao carregar resumo." });
  }
}

export async function postPayDaily(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id as number | undefined;
  if (!userId) {
    res.status(401).json({ ok: false, message: "Não autenticado." });
    return;
  }
  try {
    const charge = await payDailyTax(userId);
    res.json({ ok: true, charge });
  } catch (err) {
    if (err instanceof EnergyTaxNotStarted) {
      res.status(403).json({ ok: false, code: "NOT_STARTED", message: err.message, startsAt: err.startsAt.toISOString() });
      return;
    }
    if (err instanceof EnergyTaxAlreadyPaid) {
      res.status(409).json({ ok: false, code: "ALREADY_PAID", message: err.message });
      return;
    }
    if (err instanceof EnergyTaxNoRewards) {
      res.status(400).json({ ok: false, code: "NO_REWARDS", message: err.message });
      return;
    }
    if (err instanceof EnergyTaxInsufficientBalance) {
      res.status(400).json({
        ok: false,
        code: "INSUFFICIENT_BALANCE",
        message: err.message,
        required: err.required,
        available: err.available,
      });
      return;
    }
    logger.error("[energy-tax pay-daily]", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao processar pagamento." });
  }
}
