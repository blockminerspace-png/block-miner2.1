import express, { type Express, type Request } from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import { createDistributedRateLimiter } from "#server/middleware/distributedRateLimit.js";
import { getHelmetContentSecurityPolicyOptions } from "#server/middleware/csp.js";
import { createCsrfMiddleware } from "#server/middleware/csrf.js";
import { auditContextMiddleware } from "#server/src/audit/index.js";
import { createHttpRequestLogger } from "#server/middleware/httpRequestLogger.js";
import { buildExpressCorsOptions } from "#server/utils/corsConfig.js";

function envFlag(name: string, defaultValue = false): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export type SetupExpressHttpStackOptions = {
  ADMIN_ONLY_MODE?: boolean;
};

/**
 * Core HTTP middleware: trust proxy, HTTPS redirect, helmet, CORS, body parsers, CSRF, global /api limiter.
 */
export function setupExpressHttpStack(app: Express, opts: SetupExpressHttpStackOptions = {}): void {
  const ADMIN_ONLY_MODE = Boolean(opts.ADMIN_ONLY_MODE ?? envFlag("ADMIN_ONLY_MODE", false));

  app.use(
    helmet({
      contentSecurityPolicy: getHelmetContentSecurityPolicyOptions(),
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      permissionsPolicy: {
        features: {
          camera: [],
          microphone: [],
          geolocation: [],
          midi: [],
          payment: [],
          usb: [],
          magnetometer: [],
          gyroscope: [],
          accelerometer: [],
        },
      },
    } as import("helmet").HelmetOptions),
  );
  app.use(cors(buildExpressCorsOptions()));

  if (process.env.NODE_ENV === "production") {
    app.use(compression({ threshold: 1024 }));
  }

  const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "1mb";
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.use(createCsrfMiddleware());

  const globalLimiter = createDistributedRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    name: "api_global",
    skip: (req: Request) => {
      const skipPaths = ["/api/session/heartbeat", "/api/wallet/balance", "/api/checkin/status"];
      return skipPaths.includes(req.originalUrl);
    },
    message: "Too many requests from this IP, please try again later.",
  });
  app.use("/api", auditContextMiddleware);
  app.use("/api", globalLimiter);
  app.use("/api", createHttpRequestLogger());

  if (ADMIN_ONLY_MODE) {
    app.use((req, res, next) => {
      const allowedPrefixes = [
        "/api/admin",
        "/health",
        "/uploads",
        "/assets",
        "/socket.io",
        "/favicon",
        "/manifest",
        "/robots.txt",
        "/site.webmanifest",
      ];
      if (allowedPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
        next();
        return;
      }
      if (req.path.startsWith("/api/")) {
        res.status(404).json({
          ok: false,
          code: "ADMIN_ONLY_MODE",
          message: "This instance serves only the admin panel.",
        });
        return;
      }
      next();
    });
  }
}
