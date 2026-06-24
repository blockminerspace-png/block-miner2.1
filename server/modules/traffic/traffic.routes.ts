import express from "express";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import { recordPageView } from "./traffic.service.js";
import prisma from "../../src/db/prisma.js";

export const trafficRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 30_000, max: 3 });

function sanitize(v: unknown, max = 255): string | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

trafficRouter.post("/hit", limiter, async (req, res) => {
  try {
    await recordPageView({
      path: sanitize(req.body?.path, 500) ?? "/",
      referrerDomain: sanitize(req.body?.referrerDomain),
      utmSource: sanitize(req.body?.utmSource),
      utmMedium: sanitize(req.body?.utmMedium),
      utmCampaign: sanitize(req.body?.utmCampaign),
    });
  } catch { /* best-effort */ }
  res.json({ ok: true });
});

const clientErrorLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const CLIENT_ERROR_NOISE = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /\bblob:https?:\/\//i,
  /ss\.mrmnd\.com/i,
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  /doubleclick\.net/i,
  /facebook\.net/i,
  // Stale-chunk errors are self-healing (auto-reload throttle) — never useful here.
  /dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
];

trafficRouter.post("/client-error", clientErrorLimiter, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const message = sanitize(body.message, 800) ?? "";
  const stack = sanitize(body.stack, 4000);
  const componentStack = sanitize(body.componentStack, 4000);
  const url = sanitize(body.url, 800);
  const userAgent = sanitize(req.headers["user-agent"], 400);

  const noise = (s: string | null) => !!s && CLIENT_ERROR_NOISE.some((re) => re.test(s));
  if (noise(message) || noise(stack) || noise(componentStack)) {
    return res.json({ ok: true, dropped: true });
  }
  const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "").slice(0, 64);
  const buildId = sanitize(body.buildId, 64);

  // Structured log so it shows up in docker logs even if DB write fails
  // eslint-disable-next-line no-console
  console.error(
    "[client_error_report]",
    JSON.stringify({ message, stack, componentStack, url, userAgent, ip, buildId }),
  );

  try {
    await prisma.auditLog.create({
      data: {
        action: "client_error_report",
        source: "client",
        severity: "error",
        label: message.slice(0, 200) || "(empty)",
        description: stack || componentStack || null,
        ip: ip || null,
        userAgent: userAgent || null,
        metadata: { url, stack, componentStack, buildId },
      },
    });
  } catch { /* never fail an error report */ }

  res.json({ ok: true });
});
