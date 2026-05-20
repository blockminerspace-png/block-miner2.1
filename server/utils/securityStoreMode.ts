function envTruthy(name) {
  const s = String(process.env[name] ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * In-memory security backends are used during unit tests so CI does not require Postgres
 * for idempotency / rate / lockout. Production always uses Postgres (CallbackQueue + advisory locks).
 */
export function useMemorySecurityStores() {
  return process.env.NODE_ENV === "test" && String(process.env.FORCE_PG_SECURITY_STORES || "").trim() !== "1";
}

/**
 * Sliding-window API rate limits only. When true, avoids a Postgres transaction + advisory lock
 * on every limited request (see slidingWindowRateLimit.js). Does not affect idempotency or lockout.
 * Set API_RATE_LIMIT_USE_MEMORY=1 for single-app-container deploys (e.g. Docker: nginx + app + db).
 */
export function useMemoryRateLimitStore() {
  if (String(process.env.FORCE_PG_RATE_LIMIT || "").trim() === "1") return false;
  if (process.env.NODE_ENV === "test") return true;
  return envTruthy("API_RATE_LIMIT_USE_MEMORY");
}

/**
 * Login lockout counters in memory (single app container). Avoids Postgres advisory-lock
 * transactions on every login attempt when the pool is already under pressure.
 */
export function useAuthLockoutMemoryStore() {
  if (String(process.env.FORCE_PG_LOCKOUT || "").trim() === "1") return false;
  if (process.env.NODE_ENV === "test") return true;
  return envTruthy("AUTH_LOCKOUT_USE_MEMORY") || envTruthy("API_RATE_LIMIT_USE_MEMORY");
}
