/**
 * Sliding-window rate limits backed by Postgres (see slidingWindowRateLimit.js). No Redis.
 * Optional `secondaryKeyGenerator` enforces a second independent window (e.g. IP + userId).
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createRateLimiter } from "./rateLimit.js";
import { slidingWindowAllow, __resetSlidingWindowMemoryForTests } from "../services/slidingWindowRateLimit.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";
import { logSecurityEvent } from "../utils/securityLogger.js";
import loggerLib from "../utils/logger.js";

const log = loggerLib.child("DistributedRateLimit");

export type CreateDistributedRateLimiterOptions = {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
  secondaryKeyGenerator?: (req: Request) => string | null | undefined;
  skip?: (req: Request) => boolean;
  message?: string;
  statusCode?: number;
  name?: string;
};

export function createDistributedRateLimiter(opts: CreateDistributedRateLimiterOptions = {}): RequestHandler {
  const {
    windowMs = 60_000,
    max = 30,
    keyGenerator,
    secondaryKeyGenerator,
    skip,
    message,
    statusCode = 429,
    name = "global",
  } = opts;

  const fallback = createRateLimiter({
    windowMs,
    max,
    keyGenerator,
    skip,
    message,
    statusCode,
  });

  return async function distributedRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (typeof skip === "function" && skip(req)) {
      next();
      return;
    }
    const resolveKey: (r: Request) => string =
      typeof keyGenerator === "function"
        ? keyGenerator
        : (r) => {
            const userId = r.user?.id ? `user:${r.user.id}` : "anon";
            return `${r.ip}:${r.path}:${userId}`;
          };
    const dedupeKey = resolveKey(req);

    try {
      const primary = await slidingWindowAllow({
        dedupeKey,
        windowMs,
        max,
        redisPrefix: `rl:${name}:p`,
      });
      if (!primary.ok) {
        logSecurityEvent(
          "RATE_LIMIT_EXCEEDED",
          { limiterName: name, window: "primary", retryAfterSec: primary.retryAfterSec },
          req,
        );
        res.setHeader("Retry-After", String(primary.retryAfterSec));
        res.status(statusCode).json(
          buildSecurityErrorJson(SecurityErrorCodes.RATE_LIMIT_EXCEEDED, {
            extra: { retryAfterSec: primary.retryAfterSec },
          }),
        );
        return;
      }

      if (typeof secondaryKeyGenerator === "function") {
        const secKey = secondaryKeyGenerator(req);
        if (secKey) {
          const secondary = await slidingWindowAllow({
            dedupeKey: secKey,
            windowMs,
            max,
            redisPrefix: `rl:${name}:s`,
          });
          if (!secondary.ok) {
            logSecurityEvent(
              "RATE_LIMIT_EXCEEDED",
              { limiterName: name, window: "secondary", retryAfterSec: secondary.retryAfterSec },
              req,
            );
            res.setHeader("Retry-After", String(secondary.retryAfterSec));
            res.status(statusCode).json(
              buildSecurityErrorJson(SecurityErrorCodes.RATE_LIMIT_EXCEEDED, {
                extra: { retryAfterSec: secondary.retryAfterSec },
              }),
            );
            return;
          }
        }
      }

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(primary.remaining));
      next();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("Sliding-window check failed; using in-memory fallback", {
        limiterName: name,
        error: msg,
      });
      fallback(req, res, next);
    }
  };
}

export { __resetSlidingWindowMemoryForTests };
