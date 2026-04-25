import prisma from "../db/prisma.js";

const joinBuckets = new Map();

/**
 * Simple sliding-window rate limit per socket remote address.
 * @param {string} key
 * @param {number} max
 * @param {number} windowMs
 */
function allowJoin(key, max = 60, windowMs = 60000) {
  const now = Date.now();
  const arr = (joinBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  joinBuckets.set(key, arr);
  return true;
}

/**
 * @param {object} deps
 * @param {import("socket.io").Server} deps.io
 * @param {(token: string) => import("jsonwebtoken").JwtPayload | null} deps.verifyAccessToken
 * @param {(token: string | null | undefined) => import("jsonwebtoken").JwtPayload | null} deps.verifyAdminJwtToken
 * @param {(req: { headers: Record<string, string | string[] | undefined> }) => string | null} deps.getTokenFromRequest
 * @param {(req: { headers: Record<string, string | string[] | undefined> }) => string | null} [deps.getAdminTokenFromRequest]
 */
export function registerSupportSocketHandlers({
  io,
  verifyAccessToken,
  verifyAdminJwtToken,
  getTokenFromRequest,
  getAdminTokenFromRequest
}) {
  io.on("connection", (socket) => {
    const remote = String(socket.handshake.address || "unknown");

    socket.on("support:subscribe", async ({ token, supportMessageId } = {}, callback) => {
      try {
        if (!allowJoin(`support:u:${remote}`)) {
          callback?.({ ok: false, message: "Rate limited." });
          return;
        }
        const sid = Number(supportMessageId);
        if (!sid || Number.isNaN(sid)) {
          callback?.({ ok: false, message: "Invalid ticket." });
          return;
        }
        const explicitToken = typeof token === "string" && token.split(".").length === 3 ? token : null;
        const requestLike = { headers: socket.request?.headers || {} };
        const authToken = explicitToken || getTokenFromRequest(requestLike);
        const payload = authToken ? verifyAccessToken(authToken) : null;
        const userId = Number(payload?.sub);
        if (!userId) {
          callback?.({ ok: false, message: "Session invalid." });
          return;
        }
        const ticket = await prisma.supportMessage.findUnique({
          where: { id: sid },
          select: { userId: true }
        });
        if (!ticket || ticket.userId !== userId) {
          callback?.({ ok: false, message: "Not found." });
          return;
        }
        socket.join(`support:${sid}`);
        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, message: "Unable to subscribe." });
      }
    });

    socket.on("support:subscribeAdmin", async ({ token, supportMessageId } = {}, callback) => {
      try {
        if (!allowJoin(`support:a:${remote}`)) {
          callback?.({ ok: false, message: "Rate limited." });
          return;
        }
        const sid = Number(supportMessageId);
        if (!sid || Number.isNaN(sid)) {
          callback?.({ ok: false, message: "Invalid ticket." });
          return;
        }
        const explicitAdmin = typeof token === "string" && token.split(".").length === 3 ? token : null;
        const handshakeHeaders = socket.handshake?.headers || {};
        const requestLike = { headers: handshakeHeaders };
        const cookieAdmin =
          typeof getAdminTokenFromRequest === "function"
            ? getAdminTokenFromRequest(requestLike)
            : null;
        const payload = verifyAdminJwtToken(explicitAdmin || cookieAdmin);
        if (!payload) {
          callback?.({ ok: false, message: "Admin session invalid." });
          return;
        }
        const ticket = await prisma.supportMessage.findUnique({
          where: { id: sid },
          select: { id: true }
        });
        if (!ticket) {
          callback?.({ ok: false, message: "Not found." });
          return;
        }
        socket.join(`support:${sid}`);
        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, message: "Unable to subscribe." });
      }
    });
  });
}
