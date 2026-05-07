/**
 * Safe metadata for logs when catching Prisma (or DB) errors — avoid dumping full query text.
 * @param {unknown} err
 * @returns {{ code?: string, message: string, meta?: string }}
 */
export function prismaSafeErrorMeta(err) {
  const e = err && typeof err === "object" ? err : null;
  const code = e && "code" in e && typeof e.code === "string" ? e.code : undefined;
  const rawMsg = e && "message" in e && typeof e.message === "string" ? e.message : String(err ?? "");
  const looksTechnical =
    /Invalid `prisma\.|PrismaClient|prisma\.|PANIC|Expected .* got .*invocation/i.test(rawMsg);
  const message = looksTechnical ? "Prisma/database error (redacted)" : rawMsg.slice(0, 240);
  let meta;
  if (e && "meta" in e && e.meta != null) {
    try {
      meta = JSON.stringify(e.meta).slice(0, 200);
    } catch {
      meta = undefined;
    }
  }
  return { code, message, meta };
}
