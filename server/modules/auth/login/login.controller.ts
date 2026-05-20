import crypto from "crypto";
import type { Request, Response } from "express";
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
import { comparePassword, compareDummyPassword } from "../shared/auth.service.js";
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

    const identifierStr = String(identifier ?? "");

    // 1. Intercept legacy usernames before hitting the DB.
    // If the input doesn't look like an email, we reject it explicitly
    // instead of returning "invalid credentials", guiding the user to use email.
    if (!identifierStr.includes("@")) {
      await compareDummyPassword(String(password ?? "")); // timing attack mitigation
      await recordAuthLoginFailure({ ip: clientIp, userId: null });
      logUserActivity("AUTH_LOGIN_FAILURE", req, { reason: "USERNAME_NOT_SUPPORTED" });
      void enqueueAuditEventBestEffort({
        prismaOrTx: prisma,
        event: buildAuditEventFromHttpRequest({
          req,
          event: {
            eventType: AuditEventType.AUTH_LOGIN_FAILURE,
            status: AuditEventStatus.FAILED,
            resultCode: "USERNAME_NOT_SUPPORTED",
            payload: { identifier },
          },
        }),
      });
      res
        .status(400)
        .json(buildAuthFailureJson("USERNAME_NOT_SUPPORTED", AUTH_LOGIN_MESSAGES.USERNAME_NOT_SUPPORTED));
      return;
    }

    const user = await findUserByIdentifier(identifier);

    if (!user) {
      await compareDummyPassword(String(password ?? "")); // timing attack mitigation
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
        // Only count as a brute-force attempt if the code was wrong, NOT if
        // the challenge token merely expired (user took too long).
        if (twoFactorResult.reason !== "EXPIRED") {
          await recordAuthLoginFailure({ ip: clientIp, userId: user.id });
        }
        logUserActivity("AUTH_LOGIN_FAILURE", req, { reason: "INVALID_2FA", userId: user.id, twoFactorReason: twoFactorResult.reason });
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
          details: { reason: twoFactorResult.reason },
        });
        const failMsg = twoFactorResult.reason === "EXPIRED"
          ? AUTH_LOGIN_MESSAGES.TWO_FACTOR_EXPIRED
          : AUTH_LOGIN_MESSAGES.INVALID_2FA;
        const failCode = twoFactorResult.reason === "EXPIRED" ? "TWO_FACTOR_EXPIRED" : "INVALID_TWO_FACTOR_CODE";
        res
          .status(401)
          .json(buildAuthFailureJson(failCode, failMsg));
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

    // Update user login metadata (non-critical: never block successful login).
    // recordUserIpLog is best-effort: a failure there must not cause a 503.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ip: clientIp,
        lastLoginAt: new Date(),
        userAgent: req.headers["user-agent"],
      },
    });
    void recordUserIpLog(prisma, {
      userId: user.id,
      ip: clientIp,
      networkCidr: authIpContext.networkCidr,
      asn: authIpContext.asn,
      providerType: authIpContext.providerType,
      deviceFingerprint,
      userAgent: req.headers["user-agent"] || null,
      eventType: "login",
    }).catch((ipLogErr: unknown) => {
      const msg = ipLogErr instanceof Error ? ipLogErr.message : String(ipLogErr);
      logger.warn("auth.login.ip_log_failed", { userId: user.id, message: msg });
    });

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

    // Reuse the CSRF token that the CSRF middleware already issued for this
    // request. Generating a brand-new token here and setting it in a cookie
    // would race against the browser's cookie store: if the client reads the
    // old cookie before the new Set-Cookie lands, the very next mutation
    // request gets a 403 INVALID_CSRF_TOKEN.
    const activeCsrf = String(res.locals.csrfToken || crypto.randomBytes(24).toString("base64url"));
    res.setHeader("Set-Cookie", [
      buildAccessCookie(accessToken),
      buildRefreshCookie(refreshToken.token, refreshToken.expiresAt),
      buildCsrfCookie(activeCsrf),
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
