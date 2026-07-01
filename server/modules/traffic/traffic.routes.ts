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
  // Third-party scripts we don't control — load failures are not our bugs.
  /translate\.google\.com/i,            // Google Translate widget injecting DOM
  /translate_a\/element\.js/i,
  /youtube\.com\/iframe_api/i,           // YouTube IFrame API CDN (client already handles)
  /infird\.com/i,                       // third-party ad/analytics CDN
  // React DOM errors almost always caused by browser extensions (translators/adblocks)
  // mutating the DOM under React's feet. We can't fix these from our side.
  /Failed to execute 'insertBefore'/i,
  /'removeChild'/i,
  /NotFoundError/i,
];

trafficRouter.post("/client-error", clientErrorLimiter, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const message = sanitize(body.message, 800) ?? "";
  const stack = sanitize(body.stack, 4000);
  const componentStack = sanitize(body.componentStack, 4000);
  const url = sanitize(body.url, 800);
  const userAgent = sanitize(req.headers["user-agent"], 400);
  // category: "crash" (ErrorBoundary/global handler) ou "api_failure" (API call tratada que falhou).
  // Default "crash" mantém compatibilidade com os reportadores existentes.
  const rawCategory = sanitize(body.category, 32) ?? "crash";
  const category = rawCategory === "api_failure" ? "api_failure" : "crash";
  const action = category === "api_failure" ? "client_api_failure" : "client_error_report";

  const noise = (s: string | null) => !!s && CLIENT_ERROR_NOISE.some((re) => re.test(s));
  if (noise(message) || noise(stack) || noise(componentStack)) {
    return res.json({ ok: true, dropped: true });
  }
  // Campos extras úteis p/ api_failure (status code, code, requestId, operation).
  const statusCode = typeof body.statusCode === "number" ? body.statusCode : null;
  // api_failure: HTTP 429 (rate limit / cooldown) is expected UX, not a bug — drop it.
  if (category === "api_failure" && statusCode === 429) {
    return res.json({ ok: true, dropped: true });
  }
  const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "").slice(0, 64);
  const buildId = sanitize(body.buildId, 64);
  const code = sanitize(body.code, 64);
  const operation = sanitize(body.operation, 120);
  const requestId = sanitize(body.requestId, 80);

  // Structured log so it shows up in docker logs even if DB write fails
  // eslint-disable-next-line no-console
  console.error(
    "[" + action + "]",
    JSON.stringify({ category, message, statusCode, code, operation, url, userAgent, ip, buildId }),
  );

  try {
    await prisma.auditLog.create({
      data: {
        action,
        source: "client",
        severity: category === "api_failure" ? "warning" : "error",
        label: message.slice(0, 200) || "(empty)",
        description: stack || componentStack || null,
        ip: ip || null,
        userAgent: userAgent || null,
        metadata: { category, url, stack, componentStack, buildId, statusCode, code, operation, requestId },
      },
    });
  } catch { /* never fail an error report */ }

  res.json({ ok: true });
});
