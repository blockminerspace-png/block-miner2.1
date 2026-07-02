import crypto from "crypto";
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../../../src/db/prisma.js";
import { signAccessToken, createRefreshToken } from "../../../utils/authTokens.js";
import { createRefreshTokenRecord } from "../../../models/refreshTokenModel.js";
import { createAuditLogBestEffort } from "../../../models/auditLogModel.js";
import { buildCsrfCookie } from "../../../middleware/csrf.js";
import { enqueueAuditEvent, buildAuditEventFromHttpRequest } from "../../../src/audit/service.js";
import { AuditEventType, AuditEventStatus } from "../../../src/audit/constants.js";
import { createInventoryWithOwnedMachineTx } from "../../../services/userOwnedMachineService.js";
import { getRequestIp } from "../../../utils/clientIp.js";
import { getMiningEngine } from "../../../src/miningEngineInstance.js";
import { isSmtpConfigured } from "../../../utils/mailer.js";
import { enqueueWelcomeEmail, isBullMqPublishingEnabled } from "../../../jobs/blockminerQueue.js";
import {
  buildDeviceFingerprint,
  evaluateRegistrationAttempt,
  getAuthIpContext,
  recordUserIpLog,
} from "../../../services/authNetworkSignalService.js";
import { getCachedIpIntelligence } from "../../../services/ipIntelligenceService.js";
import loggerLib, { logUserActivity } from "../../../utils/logger.js";
import { logSecurityEvent } from "../../../utils/securityLogger.js";
import { toAuthPublicUserDto } from "../auth.dto.js";
import {
  normalizeIdentifier,
  normalizeEmail,
  resolveReferrerFromRefInput,
  generateUniqueRefCode,
  ensureWelcomeMiner,
} from "../shared/auth.repository.js";
import { unknownErrorMessage, prismaClientErrorFields, buildAccessCookie, buildRefreshCookie } from "../shared/auth.security.js";
import { AUTH_LOGIN_MESSAGES } from "../auth.errors.js";
import { respondAuthPrismaError } from "../shared/auth.prisma.js";
import { hashPassword } from "../shared/auth.service.js";

const logger = loggerLib.child("RegisterController");

export async function registerPost(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, password, refCode: refCodeInput, acceptTerms,
      utmSource, utmMedium, utmCampaign, referrerDomain } = req.body as {
      username?: unknown;
      email?: unknown;
      password?: unknown;
      refCode?: unknown;
      acceptTerms?: unknown;
      utmSource?: unknown;
      utmMedium?: unknown;
      utmCampaign?: unknown;
      referrerDomain?: unknown;
    };
    const sanitizeAttr = (v: unknown) => {
      if (!v || typeof v !== "string") return null;
      const s = v.trim().slice(0, 255);
      return s || null;
    };
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedEmail = normalizeEmail(email);
    const clientIp = getRequestIp(req);
    const deviceFingerprint = buildDeviceFingerprint(req);
    const ipContext = await getAuthIpContext(prisma, clientIp);

    if (!acceptTerms) {
      res.status(400).json({
        ok: false,
        message: "Invalid request data.",
        errors: [{ path: "acceptTerms", message: "validation.errors.termsRequired" }],
      });
      return;
    }

    const registrationAttempt = await evaluateRegistrationAttempt(prisma, {
      ip: clientIp,
      networkCidr: ipContext.networkCidr,
      providerType: ipContext.providerType,
      deviceFingerprint,
    });
    if (!registrationAttempt.allowed) {
      logSecurityEvent(
        "AUTH_REGISTER_COOLDOWN",
        {
          ip: clientIp,
          networkCidr: ipContext.networkCidr,
          providerType: ipContext.providerType,
          deviceFingerprint,
          score: registrationAttempt.score,
          reasons: registrationAttempt.reasons,
          recentExactIp: registrationAttempt.recentExactIp,
          recentFingerprint: registrationAttempt.recentFingerprint,
          recentNetwork: registrationAttempt.recentNetwork,
        },
        req,
      );
      res.status(429).json({
        ok: false,
        code: "REGISTRATION_COOLDOWN",
        message: "Too many recent registrations from this network or device. Try again later.",
        cooldownMinutes: registrationAttempt.cooldownMinutes,
      });
      return;
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalizedEmail, mode: "insensitive" } },
          { username: { equals: normalizedUsername, mode: "insensitive" } },
          { name: { equals: normalizedUsername, mode: "insensitive" } },
        ],
      },
    });
    if (existing) {
      res.status(409).json({ ok: false, code: "USER_ALREADY_EXISTS", message: "User already exists." });
      return;
    }

    const passwordHash = await hashPassword(String(password ?? ""), 10);
    const refCode = await generateUniqueRefCode();
    let referrerId: number | null = null;

    if (refCodeInput) {
      const referrer = await resolveReferrerFromRefInput(refCodeInput);
      if (referrer) {
        if (referrer.ip === clientIp || referrer.registrationIp === clientIp) {
          logger.warn(`Self-referral attempt blocked: User ${normalizedUsername} tried to use refCode from same IP ${clientIp}`);
        } else {
          referrerId = referrer.id;
        }
      }
    }

    const freshIpIntel = await getCachedIpIntelligence(prisma, clientIp).catch(() => null);
    const authIpContext = freshIpIntel
      ? {
          networkCidr: freshIpIntel.networkCidr,
          asn: freshIpIntel.asn,
          providerType: freshIpIntel.providerType,
        }
      : ipContext;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await (tx.user as any).create({
        data: {
          name: String(username ?? ""),
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          refCode: refCode,
          ...(referrerId ? { referredBy: referrerId } : {}),
          ip: clientIp,
          registrationIp: clientIp,
          userAgent: req.headers["user-agent"] || null,
          polBalance: 0,
          usdcBalance: 0,
          utmSource: sanitizeAttr(utmSource),
          utmMedium: sanitizeAttr(utmMedium),
          utmCampaign: sanitizeAttr(utmCampaign),
          referrerDomain: sanitizeAttr(referrerDomain),
        },
      });

      if (referrerId) {
        await tx.referral.create({ data: { referrerId, referredId: user.id } });
      }

      const welcomeMiner = await ensureWelcomeMiner();

      const regNow = new Date();
      for (let i = 0; i < 8; i++) {
        await createInventoryWithOwnedMachineTx(tx, {
          userId: user.id,
          minerId: welcomeMiner.id,
          minerName: welcomeMiner.name,
          level: 1,
          hashRate: welcomeMiner.baseHashRate,
          slotSize: welcomeMiner.slotSize,
          imageUrl: welcomeMiner.imageUrl,
          acquiredAt: regNow,
          updatedAt: regNow,
        });
      }

      const racksPerRoom = parseInt(process.env.RACKS_PER_ROOM || "192", 10);
      const sala1 = await tx.userRoom.create({
        data: {
          userId: user.id,
          roomNumber: 1,
          pricePaid: 0,
        },
      });
      await tx.userRack.createMany({
        data: Array.from({ length: racksPerRoom }, (_, i) => ({
          userId: user.id,
          roomId: sala1.id,
          position: i,
        })),
      });

      await enqueueAuditEvent({
        prismaOrTx: tx,
        event: buildAuditEventFromHttpRequest({
          req,
          event: {
            userId: user.id,
            eventType: AuditEventType.AUTH_REGISTER,
            status: AuditEventStatus.SUCCESS,
            resultCode: "USER_REGISTERED",
            payload: { referrerId },
          },
        }),
      });

      await recordUserIpLog(tx, {
        userId: user.id,
        ip: clientIp,
        networkCidr: authIpContext.networkCidr,
        asn: authIpContext.asn,
        providerType: authIpContext.providerType,
        deviceFingerprint,
        userAgent: req.headers["user-agent"] || null,
        eventType: "register",
      });

      return user;
    });

    void createAuditLogBestEffort({
      userId: result.id,
      action: "AUTH_REGISTER",
      ip: clientIp,
      userAgent: req.headers["user-agent"] || null,
      details: { email: result.email, username: result.username },
    });

    const accessToken = signAccessToken(result);
    const refreshToken = createRefreshToken();
    await createRefreshTokenRecord({ userId: result.id, ...refreshToken, createdAt: Date.now() });

    if (referrerId) {
      try {
        const engine = getMiningEngine();
        if (engine) {
          await engine.reloadMinerProfile(referrerId);
        }
      } catch (err) {
        logger.error("Failed to reload referrer profile", { referrerId, error: unknownErrorMessage(err) });
      }
    }

    const regCsrf = crypto.randomBytes(24).toString("base64url");
    res.locals.csrfToken = regCsrf;
    res.setHeader("Set-Cookie", [
      buildAccessCookie(accessToken),
      buildRefreshCookie(refreshToken.token, refreshToken.expiresAt),
      buildCsrfCookie(regCsrf),
    ]);
    logUserActivity("AUTH_REGISTER_SUCCESS", req, { userId: result.id });
    if (isSmtpConfigured() && isBullMqPublishingEnabled()) {
      void enqueueWelcomeEmail({
        userId: result.id,
        email: normalizedEmail,
        displayName: result.name || normalizedUsername,
      });
    }
    res.status(201).json({
      ok: true,
      user: toAuthPublicUserDto(result, { usernameOverride: normalizedUsername }),
    });
  } catch (error: unknown) {
    const errMsg = unknownErrorMessage(error);
    const { code: prismaCode, meta } = prismaClientErrorFields(error);
    logger.error("Register error", { message: errMsg, prismaCode, meta });

    if (prismaCode === "P2002") {
      res.status(409).json({
        ok: false,
        code: "USER_ALREADY_EXISTS",
        message: "User already exists.",
      });
      return;
    }

    if (respondAuthPrismaError(res, error, AUTH_LOGIN_MESSAGES.SERVICE_UNAVAILABLE, "auth.register.db_unavailable")) {
      return;
    }

    res.status(500).json({
      ok: false,
      code: "REGISTRATION_FAILED",
      message: "auth.register.errors.registration_failed",
    });
  }
}
