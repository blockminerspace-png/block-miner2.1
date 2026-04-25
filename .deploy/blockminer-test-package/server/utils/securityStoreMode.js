/**
 * In-memory security backends are used during unit tests so CI does not require Postgres
 * for idempotency / rate / lockout. Production always uses Postgres (CallbackQueue + advisory locks).
 */
export function useMemorySecurityStores() {
  return process.env.NODE_ENV === "test" && String(process.env.FORCE_PG_SECURITY_STORES || "").trim() !== "1";
}
