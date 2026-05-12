import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { createAuditLog } from "../models/auditLogModel.js";
import { INTERNAL_SHORTLINK_TYPE } from "../models/shortlinkRewardModel.js";
import { createInventoryWithOwnedMachineTx } from "../services/userOwnedMachineService.js";

const logger = loggerLib.child("ShortlinkController");
const TOTAL_STEPS = 3;
const MAX_DAILY_RUNS = 1;

type AuthedRequest = Request & { user: { id: number } };

function todayMidnightUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function resetDailyIfNeeded(status: Awaited<ReturnType<typeof prisma.shortlinkCompletion.findUnique>>) {
  if (!status) return status;
  const midnight = todayMidnightUTC();
  const lastCompletion = status.completedAt || status.resetAt;
  if (status.dailyRuns > 0 && lastCompletion && lastCompletion < midnight) {
    return prisma.shortlinkCompletion.update({
      where: { userId: status.userId },
      data: { dailyRuns: 0, resetAt: new Date() }
    });
  }
  return status;
}

function generateStepToken(userId: number, step: number): string {
  const secret = process.env.JWT_SECRET || "fallback-secret-for-dev";
  return createHash("sha256")
    .update(`${userId}-${step}-${secret}-${Date.now()}`)
    .digest("hex");
}

export async function getShortlinkStatus(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    let status = await prisma.shortlinkCompletion.findUnique({ where: { userId } });
    if (!status) {
      status = await prisma.shortlinkCompletion.create({
        data: { userId, currentStep: 0, dailyRuns: 0 }
      });
    }
    status = await resetDailyIfNeeded(status);
    res.json({
      ok: true,
      status: {
        currentStep: status.currentStep,
        dailyRuns: status.dailyRuns,
        shortlinkName: "Internal Shortlink",
        rewardName: "5 HS Mining Machine",
        totalSteps: TOTAL_STEPS,
        maxDailyRuns: MAX_DAILY_RUNS,
        inProgress: status.currentStep > 0
      }
    });
  } catch {
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

export async function startShortlink(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;

    let status = await prisma.shortlinkCompletion.findUnique({ where: { userId } });
    status = await resetDailyIfNeeded(status);

    if (status && status.dailyRuns >= MAX_DAILY_RUNS) {
      return res.status(403).json({ ok: false, message: "Limite diário alcançado. Volte amanhã." });
    }

    const sessionToken = generateStepToken(userId, 1);
    await prisma.shortlinkCompletion.upsert({
      where: { userId },
      update: { currentStep: 0, sessionToken, stepStartedAt: new Date() },
      create: { userId, currentStep: 0, dailyRuns: 0, sessionToken, stepStartedAt: new Date() }
    });
    res.json({ ok: true, nextStep: 1, sessionToken });
  } catch {
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

export async function completeShortlinkStep(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    const { step, sessionToken, securityFlags } = req.body as {
      step?: unknown;
      sessionToken?: unknown;
      securityFlags?: { isUntrustedEvent?: boolean };
    };
    const normalizedStep = Number(step);
    const now = new Date();

    const status = await prisma.shortlinkCompletion.findUnique({ where: { userId } });
    if (!status || !status.sessionToken) return res.status(400).json({ ok: false, message: "No session" });

    const freshStatus = await resetDailyIfNeeded(status);
    if (freshStatus && freshStatus.dailyRuns >= MAX_DAILY_RUNS) {
      return res.status(403).json({ ok: false, message: "Limite diário alcançado." });
    }

    const incidents: string[] = [];
    if (status.sessionToken !== sessionToken) incidents.push("token_mismatch");

    if (securityFlags?.isUntrustedEvent) incidents.push("script_click");

    const startTime = status.stepStartedAt ? status.stepStartedAt.getTime() : 0;
    const timeElapsed = now.getTime() - startTime;

    if (timeElapsed < 8000) incidents.push("too_fast");

    if (incidents.length > 0) {
      await createAuditLog({
        userId,
        action: "shortlink_cheat_attempt",
        details: { step: normalizedStep, incidents, timeElapsed }
      });
      return res.status(403).json({ ok: false, message: "Detection: " + incidents.join(", "), kick: true });
    }

    let reward: { message: string } | null = null;
    const isLastStep = normalizedStep === TOTAL_STEPS;
    const nextStep = isLastStep ? 0 : normalizedStep + 1;
    const nextSessionToken = isLastStep ? null : generateStepToken(userId, nextStep);

    await prisma.$transaction(async (tx) => {
      await tx.shortlinkCompletion.update({
        where: { userId },
        data: {
          currentStep: nextStep,
          dailyRuns: isLastStep ? { increment: 1 } : undefined,
          completedAt: isLastStep ? now : undefined,
          sessionToken: nextSessionToken,
          stepStartedAt: now
        }
      });

      if (isLastStep) {
        const shortlinkReward = await tx.shortlinkReward.findFirst({
          where: { shortlinkType: INTERNAL_SHORTLINK_TYPE, isActive: true },
          include: { miner: true }
        });

        if (!shortlinkReward?.miner) {
          throw new Error("Recompensa de shortlink não configurada no sistema. Contate o administrador.");
        }

        const miner = shortlinkReward.miner;
        await createInventoryWithOwnedMachineTx(tx, {
          userId,
          minerId: miner.id,
          minerName: miner.name,
          level: 1,
          hashRate: miner.baseHashRate,
          slotSize: miner.slotSize,
          imageUrl: miner.imageUrl,
          acquiredAt: now,
          updatedAt: now
        });
        reward = { message: `${miner.name} adicionada ao inventário!` };
      }
    });

    res.json({ ok: true, step: normalizedStep, runCompleted: isLastStep, sessionToken: nextSessionToken, reward });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Process failed";
    logger.error("completeShortlinkStep error", { error: msg });
    res.status(500).json({ ok: false, message: msg || "Process failed" });
  }
}
