import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { createAuditLog } from "../models/auditLogModel.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import type { Prisma } from "@prisma/client";
import { getBoostTtlMs } from "../services/powerBoostService.js";
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";

function brazilMidnightUTC(): Date {
  const todayKey = getBrazilCheckinDateKey();
  return new Date(`${todayKey}T00:00:00-03:00`);
}

const logger = loggerLib.child("ShortlinkController");
const TOTAL_STEPS = 3;
const MAX_DAILY_RUNS = 1;
const REWARD_HASH_RATE = 5.0;
const REWARD_DURATION_HOURS = 24;

type AuthedRequest = Request & { user: { id: number } };

async function resetDailyIfNeeded(status: Awaited<ReturnType<typeof prisma.shortlinkCompletion.findUnique>>) {
  if (!status) return status;
  const brazilMidnight = brazilMidnightUTC();
  const lastCompletion = status.completedAt || status.resetAt;
  if (status.dailyRuns > 0 && lastCompletion && lastCompletion < brazilMidnight) {
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
    if (!status) {
      return res.status(500).json({ ok: false, message: "Server error" });
    }
    res.json({
      ok: true,
      status: {
        currentStep: status.currentStep,
        dailyRuns: status.dailyRuns,
        shortlinkName: "Internal Shortlink",
        rewardName: `+${REWARD_HASH_RATE} H/s por ${REWARD_DURATION_HOURS}h`,
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

    if (!status) {
      return res.status(500).json({ ok: false, message: "Server error" });
    }

    if (status.dailyRuns >= MAX_DAILY_RUNS) {
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
    if (!Number.isInteger(normalizedStep) || normalizedStep < 1 || normalizedStep > TOTAL_STEPS) {
      res.status(400).json({ ok: false, message: "Invalid step" });
      return;
    }
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
        ip: req.ip || null,
        userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
        details: { step: normalizedStep, incidents, timeElapsed },
        label: null,
        description: null,
        relatedEntityType: null,
        relatedEntityId: null,
        actorAdminId: null,
      });
      return res.status(403).json({ ok: false, message: "Detection: " + incidents.join(", "), kick: true });
    }

    const isLastStep = normalizedStep === TOTAL_STEPS;
    const nextStep = isLastStep ? 0 : normalizedStep + 1;
    const nextSessionToken = isLastStep ? null : generateStepToken(userId, nextStep);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        const ttlMs = await getBoostTtlMs(userId);
        const expiresAt = new Date(now.getTime() + ttlMs);
        await tx.shortlinkPower.create({
          data: { userId, hashRate: REWARD_HASH_RATE, claimedAt: now, expiresAt }
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: "shortlink_power_claimed",
            detailsJson: JSON.stringify({ hashRate: REWARD_HASH_RATE, durationHours: REWARD_DURATION_HOURS, expiresAt })
          }
        });
      }
    });

    let rewardMessage: string | null = null;
    if (isLastStep) {
      rewardMessage = `+${REWARD_HASH_RATE} H/s ativado por ${REWARD_DURATION_HOURS}h!`;
      try {
        const newTotal = await syncUserBaseHashRate(userId);
        const engine = getMiningEngine();
        if (engine) {
          const miner = engine.findMinerByUserId(userId);
          if (miner) miner.baseHashRate = newTotal;
          if (engine.io) engine.io.to(`user:${userId}`).emit("machines:update");
        }
      } catch (syncErr: unknown) {
        logger.warn("Shortlink claim: engine sync failed (non-fatal)", {
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }

    res.json({
      ok: true,
      step: normalizedStep,
      runCompleted: isLastStep,
      sessionToken: nextSessionToken,
      reward: rewardMessage ? { message: rewardMessage } : null
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Process failed";
    logger.error("completeShortlinkStep error", { error: msg });
    res.status(500).json({ ok: false, message: msg || "Process failed" });
  }
}
