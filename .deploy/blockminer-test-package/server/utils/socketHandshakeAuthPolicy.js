/**
 * Validates optional `handshake.auth.token` from Socket.IO clients.
 * Empty / absent token means "no explicit auth" (connection allowed; app handlers still join-gate).
 * @param {unknown} raw
 * @param {(t: string) => import("jsonwebtoken").JwtPayload | null} verifyAccessToken
 * @returns {{ kind: "skip" } | { kind: "reject"; message: string } | { kind: "ok"; userId: number }}
 */
export function evaluateExplicitSocketHandshakeToken(raw, verifyAccessToken) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { kind: "skip" };
  }
  const t = raw.trim();
  if (t.split(".").length !== 3) {
    return { kind: "reject", message: "Unauthorized" };
  }
  const payload = verifyAccessToken(t);
  const userId = Number(payload?.sub);
  if (!userId) {
    return { kind: "reject", message: "Unauthorized" };
  }
  return { kind: "ok", userId };
}

/**
 * @param {import("socket.io").Server} io
 * @param {{ verifyAccessToken: (t: string) => import("jsonwebtoken").JwtPayload | null }} deps
 */
export function attachSocketIoExplicitAuthMiddleware(io, { verifyAccessToken }) {
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token;
      const r = evaluateExplicitSocketHandshakeToken(raw, verifyAccessToken);
      if (r.kind === "skip") {
        next();
        return;
      }
      if (r.kind === "reject") {
        next(new Error(r.message));
        return;
      }
      socket.data.handshakeAuthUserId = r.userId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
}
