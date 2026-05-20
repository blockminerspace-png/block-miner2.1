import crypto from "crypto";
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../../../src/db/prisma.js";
import { signAccessToken, createRefreshToken } from "../../../utils/authTokens.js";
import { createRefreshTokenRecord } from "../../../models/refreshTokenModel.js";
import { createAuditLogBestEffort } from "../../../models/auditLogModel.js";
import { buildCsrfCookie } from "../../../middleware/csrf.js";
import { enqueueAuditEventBestEffort, buildAuditEventFromHttpRequest } from "../../../src/audit/service.js";
import { unknownErrorMessage } from "../../../utils/prismaHttpErrors.js";
import { respondAuthPrismaError } from "../shared/auth.prisma.js";
import { AuditEventType, AuditEventStatus } from "../../../src/audit/constants.js";
import { getRequestIp } from "../../../utils/clientIp.js";
import { getAuthLockStatus, recordAuthLoginFailure, recordAuthLoginSuccess } from "../../../services/accountLockoutService.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../../../utils/securityErrors.js";
import { isSmtpConfigured } from "../../../utils/mailer.js";
import { issueEmailTwoFactorChallenge, verifyEmailTwoFactorChallenge } from "../../../services/emailTwoFactorService.js";
import { buildDeviceFingerprint, getAuthIpContext, recordUserIpLog } from "../../../services/authNetworkSignalService.js";
import { getCachedIpIntelligence } from "../../../services/ipIntelligenceService.js";
import loggerLib, { logUserActivity } from "../../../utils/logger.js";
import { toAuthPublicUserDto } from "../auth.dto.js";
import { AUTH_LOGIN_MESSAGES, buildAuthFailureJson } from "../auth.errors.js";
import { findUserByIdentifier } from "../shared/auth.repository.js";
import { buildAccessCookie, buildRefreshCookie } from "../shared/auth.security.js";
import { comparePassword } from "../shared/auth.service.js";
import { getAuthTwoFactorEnvConfig, shouldRequireEmailTwoFactorForLogin } from "./login.twoFactor.js";

const logger = loggerLib.child("LoginController");

export async function loginPost(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password, twoFactorToken, twoFactorChallengeToken } = req.body as {
      identifier?: unknown;
      password?: unknown;
      twoFactorToken?: unknown;
      twoFactorChallengeToken?: unknown;
    };
    const clientIp = getRequestIp(req);
    const deviceFingerprint = buildDeviceFingerprint(req);
    const ipContext = await getAuthIpContext(prisma, clientIp).catch(() => ({
      normalizedIp: clientIp,
      networkCidr: null,
      asn: null,
      providerType: "unknown",
    }));

    const ipLock = await getAuthLockStatus({ ip: clientIp, userId: null });
    if (ipLock.locked) {
      logUserActivity("AUTH_LOCKOUT_DENIED", req, { reason: "ip", lockedUntil: ipLock.until });
      res
        .status(403)
        .json(
          buildSecurityErrorJson(SecurityErrorCodes.ACCOUNT_LOCKED, {
            extra: { lockedUntil: ipLock.until },
          }),
        );
      return;
    }

    const user = await findUserByIdentifier(identifier);

    if (!user) {
      await recordAuthLoginFailure({ ip: clientIp, userId: null });
      logUserActivity("AUTH_LOGIN_FAILURE", req, { reason: "IDENTIFIER_NOT_FOUND" });
      void enqueueAuditEventBestEffort({
        prismaOrTx: prisma,
        event: buildAuditEventFromHttpRequest({
          req,
          event: {
            eventType: AuditEventType.AUTH_LOGIN_FAILURE,
            status: AuditEventStatus.FAILED,
            resultCode: "IDENTIFIER_NOT_FOUND",
            payload: { identifier },
          },
        }),
      });
      void createAuditLogBestEffort({
        userId: null,
        action: "AUTH_LOGIN_FAILURE",
        ip: clientIp,
        userAgent: req.headers["user-agent"] || null,
        details: { reason: "IDENTIFIER_NOT_FOUND", identifier },
      });
      res
        .status(401)
        .json(buildAuthFailureJson("INVALID_CREDENTIALS", AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS));
      return;
    }

    const combinedLock = await getAuthLockStatus({ ip: clientIp, userId: user.id });
    if (combinedLock.locked) {
      logUserActivity("AUTH_LOCKOUT_DENIED", req, {
        reason: "user_or_ip",
        userId: user.id,
        lockedUntil: combinedLock.until,
      });
      res
        .status(403)
        .json(
          buildSecurityErrorJson(SecurityErrorCodes.ACCOUNT_LOCKED, {
            extra: { lockedUntil: combinedLock.until },
          }),
        );
      return;
    }

    const isPasswordMatch = await comparePassword(String(password ?? ""), user.passwordHash);
    if (!isPasswordMatch) {
      await recordAuthLoginFailure({ ip: clientIp, userId: user.id });
      logUserActivity("AUTH_LOGIN_FAILURE", req, { reason: "INVALID_CREDENTIALS", userId: user.id });
      void enqueueAuditEventBestEffort({
        prismaOrTx: prisma,
        event: buildAuditEventFromHttpRequest({
          req,
          event: {
            userId: user.id,
            eventType: AuditEventType.AUTH_LOGIN_FAILURE,
            status: AuditEventStatus.FAILED,
            resultCode: "INVALID_CREDENTIALS",
            payload: { identifier },
          },
        }),
      });
      void createAuditLogBestEffort({
        userId: user.id,
        action: "AUTH_LOGIN_FAILURE",
        ip: clientIp,
        userAgent: req.headers["user-agent"] || null,
        details: { reason: "INVALID_CREDENTIALS", identifier },
      });
      res.status(401).json(buildAuthFailureJson("INVALID_CREDENTIALS", AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS));
      return;
    }

    if (user.isBanned) {
      res.status(403).json(buildAuthFailureJson("ACCOUNT_DISABLED", AUTH_LOGIN_MESSAGES.ACCOUNT_DISABLED));
      return;
    }

    const tfEnv = getAuthTwoFactorEnvConfig();
    const loginUser = user as {
      id: number;
      isTwoFactorEnabled?: boolean | null;
      isCreator?: boolean | null;
    };
    const requireEmail2fa = shouldRequireEmailTwoFactorForLogin({ user: loginUser, env: tfEnv });

    if (requireEmail2fa) {
      const tfToken = typeof twoFactorToken === "string" ? twoFactorToken.trim() : "";
      const tfChallenge = typeof twoFactorChallengeToken === "string" ? twoFactorChallengeToken.trim() : "";

      if (tfToken && !tfChallenge) {
        res
          .status(400)
          .json(
            buildAuthFailureJson(
              "TWO_FACTOR_CHALLENGE_REQUIRED",
              AUTH_LOGIN_MESSAGES.TWO_FACTOR_CHALLENGE_REQUIRED,
            ),
          );
        return;
      }

      if (!tfToken && tfChallenge) {
        res
          .status(400)
          .json(buildAuthFailureJson("TWO_FACTOR_CODE_REQUIRED", AUTH_LOGIN_MESSAGES.TWO_FACTOR_CODE_REQUIRED));
        return;
      }

      if (!tfToken && !tfChallenge) {
        if (!isSmtpConfigured()) {
          res
            .status(503)
            .json(
              buildAuthFailureJson("EMAIL_2FA_UNAVAILABLE", AUTH_LOGIN_MESSAGES.EMAIL_2FA_UNAVAILABLE),
            );
          return;
        }
        const challenge = await issueEmailTwoFactorChallenge({
          userId: user.id,
          email: user.email,
          name: user.name,
        });
        if (!challenge.ok) {
          res
            .status(503)
            .json(
              buildAuthFailureJson("EMAIL_2FA_UNAVAILABLE", AUTH_LOGIN_MESSAGES.EMAIL_2FA_UNAVAILABLE),
            );
          return;
        }
        logUserActivity("AUTH_LOGIN_2FA_REQUIRED", req, { userId: user.id });
        void enqueueAuditEventBestEffort({
          prismaOrTx: prisma,
          event: buildAuditEventFromHttpRequest({
            req,
            event: {
              userId: user.id,
              eventType: AuditEventType.AUTH_2FA_CHALLENGE,
              status: AuditEventStatus.PARTIAL,
              resultCode: "TWO_FACTOR_REQUIRED",
              payload: { method: "email" },
            },
          }),
        });
        res.status(200).json({
          ok: false,
          code: "TWO_FACTOR_REQUIRED",
          require2FA: true,
          twoFactorMethod: "email",
          twoFactorChallengeToken: challenge.challengeToken,
          twoFactorTtlMinutes: challenge.ttlMinutes,
          message: AUTH_LOGIN_MESSAGES.REQUIRE_2FA_EMAIL,
          error: AUTH_LOGIN_MESSAGES.REQUIRE_2FA_EMAIL,
        });
        return;
      }

      const twoFactorResult = verifyEmailTwoFactorChallenge({
        challengeToken: tfChallenge,
        code: tfToken,
        userId: user.id,
      });
      if (!twoFactorResult.ok) {
        await recordAuthLoginFailure({ ip: clientIp, userId: user.id });
        logUserActivity("AUTH_LOGIN_FAILURE", req, { reason: "INVALID_2FA", userId: user.id });
        void enqueueAuditEventBestEffort({
          prismaOrTx: prisma,
          event: buildAuditEventFromHttpRequest({
            req,
            event: {
              userId: user.id,
              eventType: AuditEventType.AUTH_2FA_FAILURE,
              status: AuditEventStatus.FAILED,
              resultCode: "INVALID_2FA",
              payload: { method: "email", reason: twoFactorResult.reason },
            },
          }),
        });
        void createAuditLogBestEffort({
          userId: user.id,
          action: "AUTH_2FA_FAILURE",
          ip: clientIp,
          userAgent: req.headers["user-agent"] || null,
          details: { reason: "INVALID_2FA" },
        });
        res
          .status(401)
          .json(buildAuthFailureJson("INVALID_TWO_FACTOR_CODE", AUTH_LOGIN_MESSAGES.INVALID_2FA));
        return;
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

    await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            ip: clientIp,
            lastLoginAt: new Date(),
            userAgent: req.headers["user-agent"],
          },
        });
        await recordUserIpLog(tx, {
          userId: user.id,
          ip: clientIp,
          networkCidr: authIpContext.networkCidr,
          asn: authIpContext.asn,
          providerType: authIpContext.providerType,
          deviceFingerprint,
          userAgent: req.headers["user-agent"] || null,
          eventType: "login",
        });
      },
      { timeout: 20_000, maxWait: 15_000 },
    );

    void enqueueAuditEventBestEffort({
      prismaOrTx: prisma,
      event: buildAuditEventFromHttpRequest({
        req,
        event: {
          userId: user.id,
          eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
          status: AuditEventStatus.SUCCESS,
          resultCode: "LOGIN_SUCCESS",
          payload: {},
        },
      }),
    });

    const accessToken = signAccessToken(user);
    const refreshToken = createRefreshToken();
    await createRefreshTokenRecord({ userId: user.id, ...refreshToken, createdAt: Date.now() });

    await recordAuthLoginSuccess({ ip: clientIp, userId: user.id });

    logUserActivity("AUTH_LOGIN_SUCCESS", req, { userId: user.id });

    void createAuditLogBestEffort({
      userId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      ip: clientIp,
      userAgent: req.headers["user-agent"] || null,
      details: { email: user.email },
    });

    const newCsrf = crypto.randomBytes(24).toString("base64url");
    res.locals.csrfToken = newCsrf;
    res.setHeader("Set-Cookie", [
      buildAccessCookie(accessToken),
      buildRefreshCookie(refreshToken.token, refreshToken.expiresAt),
      buildCsrfCookie(newCsrf),
    ]);
    res.json({ ok: true, user: toAuthPublicUserDto(user) });
  } catch (error: unknown) {
    if (
      respondAuthPrismaError(res, error, AUTH_LOGIN_MESSAGES.SERVICE_UNAVAILABLE, "auth.login.db_unavailable")
    ) {
      return;
    }
    logger.error("auth.login.unexpected", { message: unknownErrorMessage(error) });
    res.status(500).json(buildAuthFailureJson("INTERNAL_ERROR", AUTH_LOGIN_MESSAGES.INTERNAL));
  }
}
