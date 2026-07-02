/**
 * Shared CORS allowlist for Express and Socket.IO.
 * Production requires CORS_ORIGINS (comma-separated exact origins).
 */

export function parseCorsOriginsList() {
  const raw = process.env.CORS_ORIGINS;
  return raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export function assertProductionCorsConfigured() {
  const isProd = process.env.NODE_ENV === "production";
  const list = parseCorsOriginsList();
  if (isProd && list.length === 0) {
    throw new Error(
      "CORS_ORIGINS is required in production (comma-separated origins, e.g. https://blockminer.space)."
    );
  }
}

/**
 * @returns {{ origin: Function, credentials: boolean }}
 */
export function buildExpressCorsOptions() {
  assertProductionCorsConfigured();
  const origins = parseCorsOriginsList();

  return {
    origin(origin, callback) {
      if (origins.length === 0) {
        callback(null, true);
        return;
      }
      if (!origin) {
        callback(null, true);
        return;
      }
      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Reject without throwing — Error() becomes an unhandled 500 on GET / (bots, scanners).
      callback(null, false);
    },
    credentials: true
  };
}

/**
 * Socket.IO v4 cors option shape.
 */
export function buildSocketIoCorsConfig() {
  assertProductionCorsConfigured();
  const origins = parseCorsOriginsList();
  return {
    origin: origins.length ? origins : true,
    methods: ["GET", "POST"],
    credentials: true
  };
}

/**
 * Apply Express `trust proxy` from TRUST_PROXY (1 = first proxy hop).
 * @param {import("express").Express} app
 */
export function applyTrustProxy(app) {
  const raw = String(process.env.TRUST_PROXY ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "") {
    return;
  }
  if (raw === "1" || raw === "true") {
    app.set("trust proxy", 1);
    return;
  }
  if (/^\d+$/.test(raw)) {
    app.set("trust proxy", Number(raw));
    return;
  }
  app.set("trust proxy", raw);
}
