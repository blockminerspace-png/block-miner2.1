import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const trafficRoutes = readFileSync(
  new URL("../server/modules/traffic/traffic.routes.ts", import.meta.url),
  "utf8",
);
const csrfMiddleware = readFileSync(
  new URL("../server/middleware/csrf.ts", import.meta.url),
  "utf8",
);
const adminContentRoutes = readFileSync(
  new URL("../server/modules/admin/routes/content.routes.ts", import.meta.url),
  "utf8",
);
const errorBoundary = readFileSync(
  new URL("../client/src/shared/components/ErrorBoundary.tsx", import.meta.url),
  "utf8",
);
const mainTsx = readFileSync(
  new URL("../client/src/main.tsx", import.meta.url),
  "utf8",
);
const appRoutes = readFileSync(
  new URL("../client/src/app/App.tsx", import.meta.url),
  "utf8",
);

describe("client error report pipeline", () => {
  it("traffic router exposes POST /client-error behind a rate limiter", () => {
    assert.match(trafficRoutes, /trafficRouter\.post\(["']\/client-error["']/);
    assert.match(trafficRoutes, /clientErrorLimiter/);
  });

  it("traffic router persists the report into AuditLog", () => {
    assert.match(trafficRoutes, /prisma\.auditLog\.create/);
    // default (crash) still maps to client_error_report; api_failure maps to client_api_failure
    assert.match(trafficRoutes, /client_error_report/);
    assert.match(trafficRoutes, /client_api_failure/);
    assert.match(trafficRoutes, /source:\s*["']client["']/);
  });

  it("traffic router still emits a structured console.error so docker logs catch it", () => {
    // log prefix now interpolates the action so both categories show in docker logs
    assert.match(trafficRoutes, /console\.error/);
    assert.match(trafficRoutes, /\[" \+ action \+ "\]/);
  });

  it("CSRF middleware exempts /api/track/* so the reporter is never blocked", () => {
    assert.match(csrfMiddleware, /url\.startsWith\(["']\/api\/track\/["']\)/);
  });

  it("admin router exposes GET and DELETE for /client-errors (both categories)", () => {
    assert.match(adminContentRoutes, /router\.get\(["']\/client-errors["']/);
    assert.match(adminContentRoutes, /router\.delete\(["']\/client-errors["']/);
    // admin now fetches both crash and api_failure reports
    assert.match(adminContentRoutes, /client_error_report/);
    assert.match(adminContentRoutes, /client_api_failure/);
  });

  it("ErrorBoundary self-heals stale chunks via throttled reload (1× per 60s)", () => {
    // The legacy unconditional auto-reload helper is no longer used.
    assert.doesNotMatch(errorBoundary, /handleChunkLoadFailure/);
    const didCatch = errorBoundary.slice(
      errorBoundary.indexOf("componentDidCatch"),
      errorBoundary.indexOf("render(): ReactNode"),
    );
    // For chunk errors only: shouldAutoReloadChunkError guard + forceReloadForNewBuild.
    assert.match(didCatch, /shouldAutoReloadChunkError/);
    assert.match(didCatch, /forceReloadForNewBuild/);
    assert.match(didCatch, /staleChunk/);
    // Manual reload button still works (used by render(), surrounded by onClick).
    const lastCall = errorBoundary.lastIndexOf("forceReloadForNewBuild");
    const surrounding = errorBoundary.slice(Math.max(0, lastCall - 300), lastCall);
    assert.match(surrounding, /onClick/);
  });

  it("ErrorBoundary posts exactly to /api/track/client-error with keepalive", () => {
    assert.match(errorBoundary, /\/api\/track\/client-error/);
    assert.match(errorBoundary, /keepalive:\s*true/);
  });

  it("ErrorBoundary surfaces a Telegram report link", () => {
    assert.match(errorBoundary, /t\.me\//);
    assert.match(errorBoundary, /Reportar no Telegram/);
    assert.match(errorBoundary, /target="_blank"/);
  });

  it("main.tsx window handlers no longer auto-reload — they only report", () => {
    assert.doesNotMatch(mainTsx, /handleChunkLoadFailure/);
    assert.match(mainTsx, /\/api\/track\/client-error/);
  });

  it("App.tsx wires the /admin/client-errors route", () => {
    assert.match(appRoutes, /path="\/admin\/client-errors"/);
    assert.match(appRoutes, /AdminClientErrors/);
  });
});
