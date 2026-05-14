/** Shape returned by `beginIdempotencyLease` when claim succeeds (see `idempotencyService.js`). */
export type IdempotencyLease = { type: "lease"; leaseToken: string };

export function isIdempotencyLease(value: unknown): value is IdempotencyLease {
  if (typeof value !== "object" || value === null) return false;
  const o = value as { type?: unknown; leaseToken?: unknown };
  return o.type === "lease" && typeof o.leaseToken === "string";
}
