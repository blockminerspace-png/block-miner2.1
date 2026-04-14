/**
 * Sliding-window rate limits backed by Postgres (see slidingWindowRateLimit.js). No Redis.
 * Optional `secondaryKeyGenerator` enforces a second independent window (e.g. IP + userId).
 */

import { createRateLimiter } from "./rateLimit.js";
import { slidingWindowAllow, __resetSlidingWindowMemoryForTests } from "../services/slidingWindowRateLimit.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";
import { logSecurityEvent } from "../utils/securityLogger.js";

/**
 * @param {{
 *   windowMs?: number;
 *   max?: number;
 *   keyGenerator?: (req: import("express").Request) => string;
 *   secondaryKeyGenerator?: (req: import("express").Request) => string | null | undefined;
 *   skip?: (req: import("express").Request) => boolean;
 *   message?: string;
 *   statusCode?: number;
 *   name?: string;
 * }} opts
 */
export function createDistributedRateLimiter(opts = {}) {
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

  return function distributedRateLimiter(req, res, next) {
    if (typeof skip === "function" && skip(req)) {
      next();
      return;
    }
    const resolveKey =
      typeof keyGenerator === "function"
        ? keyGenerator
        : (r) => {
            const userId = r.user?.id ? `user:${r.user.id}` : "anon";
            return `${r.ip}:${r.path}:${userId}`;
          };
    const dedupeKey = resolveKey(req);

    void (async () => {
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
      } catch {
        fallback(req, res, next);
      }
    })();
  };
}

export { __resetSlidingWindowMemoryForTests };
