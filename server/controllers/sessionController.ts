import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("SessionController");

type HeartbeatBody = {
  type?: string;
  security?: {
    isBot?: boolean;
    fingerprint?: string;
  };
};

export async function processHeartbeat(
  req: Request<unknown, unknown, HeartbeatBody>,
  res: Response
): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    const userId = req.user.id;
    const { type, security } = req.body;

    if (!type || !["youtube", "auto-mining"].includes(type)) {
      res.status(400).json({ ok: false, message: "Invalid type" });
      return;
    }

    if (security?.isBot === true) {
      logger.warn(`Bot signature detected for user ${userId} on ${type}`);
      res.status(403).json({ ok: false, message: "Automation detected. Access denied." });
      return;
    }

    try {
      const decoded = JSON.parse(Buffer.from(security?.fingerprint ?? "", "base64").toString()) as {
        ts?: number;
      };
      const nowTs = Date.now();
      const tsCandidate = decoded.ts;
      const invalidRange =
        typeof tsCandidate === "number" &&
        (tsCandidate > nowTs + 5000 || tsCandidate < nowTs - 60000);
      // When `ts` is missing, preserves legacy permissive fingerprint behavior.
      if (invalidRange) {
        res.status(400).json({ ok: false, message: "Invalid session token" });
        return;
      }
    } catch (_e: unknown) {
      res.status(400).json({ ok: false, message: "Security check failed" });
      return;
    }

    const now = new Date();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastHeartbeatAt: true },
    });

    if (user?.lastHeartbeatAt) {
      const diff = (now.getTime() - new Date(user.lastHeartbeatAt).getTime()) / 1000;
      if (diff < 8) {
        res.json({ ok: true, message: "Too fast, heartbeat throttled", buffered: true });
        return;
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastHeartbeatAt: now,
        [type === "youtube" ? "ytSecondsBalance" : "autoMiningSecondsBalance"]: {
          increment: 10,
        },
      },
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    logger.error("Heartbeat error", {
      message: e instanceof Error ? e.message : String(e),
    });
    res.status(500).json({ ok: false });
  }
}
