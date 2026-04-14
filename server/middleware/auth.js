import { getUserById } from "../models/userModel.js";
import { verifyAccessToken } from "../utils/authTokens.js";
import { getTokenFromRequest } from "../utils/token.js";
import loggerNamespace from "../utils/logger.js";
import { logSecurityEvent } from "../utils/securityLogger.js";

const logger = loggerNamespace.child("AuthMiddleware");

export async function requireAuth(req, res, next) {
  try {
    // IRON DOME V3: Advanced Payload Validation
    const antiBotFlag = req.headers['x-anti-bot'];
    const antiBotPayload = req.headers['x-anti-bot-payload'];
    const antiBotKey = req.headers['x-anti-bot-key'];

    const isAction = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase());

    if (antiBotFlag === '1' && isAction) {
      logSecurityEvent("AUTHZ_IRON_DOME_FLAG", { path: req.originalUrl || req.path }, req);
      logger.warn(`Iron Dome: Bot flag direct rejection for IP: ${req.ip} during ${req.method}`);
      return res.status(403).json({ ok: false, message: "Acesso negado. Automação detectada (Flag)." });
    }

    if (antiBotPayload && antiBotKey) {
      try {
        const decodedBase64 = Buffer.from(antiBotPayload, 'base64').toString('latin1');
        const decrypted = decodedBase64.split('').map(c =>
          String.fromCharCode(c.charCodeAt(0) ^ antiBotKey.charCodeAt(0))
        ).join('');

        const data = JSON.parse(decrypted);
        const isBot = data.b === true;
        const isAction = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase());

        // We only BLOCK if it's a confirmed bot doing an ACTION (POST/PUT/etc)
        // GET requests are allowed to proceed even if bot-flagged to ensure site loads
        if (isAction && isBot) {
          logSecurityEvent("AUTHZ_IRON_DOME_BOT_PAYLOAD", { path: req.originalUrl || req.path }, req);
          logger.warn(`Iron Dome: Action REJECTED from ${req.ip} (Bot detected during ${req.method})`);
          return res.status(403).json({ ok: false, message: "Acesso negado. Automação detectada." });
        }
      } catch (err) {
        // If decryption fails, we only block if it's a critical POST action
        if (['POST', 'PUT', 'DELETE'].includes(req.method.toUpperCase())) {
          logSecurityEvent("AUTHZ_IRON_DOME_DECRYPT_FAILED", { path: req.originalUrl || req.path }, req);
          logger.error("Iron Dome: Action decryption failed", { error: err.message });
          return res.status(403).json({ ok: false, message: "Sessão de segurança inválida." });
        }
      }
    }

    const token = getTokenFromRequest(req);

    if (!token) {
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }

    let payload = null;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        logger.debug("Token verification failed", { error: err.message });
      }
      payload = null;
    }

    const userId = Number(payload?.sub);

    if (!userId) {
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }

    const user = await getUserById(userId);

    if (!user) {
      logSecurityEvent("AUTHZ_USER_NOT_FOUND", { userId }, req);
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }

    if (user.isBanned) {
      logSecurityEvent("AUTHZ_BANNED_USER", { userId: user.id }, req);
      res.status(403).json({ ok: false, message: "Account disabled." });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error("Auth middleware error", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to authenticate." });
  }
}

// Backward-compatible alias used by a few older routes.
export const authenticateToken = requireAuth;

export async function requirePageAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.redirect(302, "/login");
      return;
    }

    let payload = null;
    try {
      payload = verifyAccessToken(token);
    } catch {
      payload = null;
    }

    const userId = Number(payload?.sub);
    if (!userId) {
      res.redirect(302, "/login");
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.redirect(302, "/login");
      return;
    }

    if (user.isBanned) {
      res.redirect(302, "/login");
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error("Page auth middleware error", { error: error.message });
    res.redirect(302, "/login");
  }
}

export async function authenticateTokenOptional(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      req.user = null;
      return next();
    }

    let payload = null;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      logger.debug("Optional token verification failed", { error: err.message });
      req.user = null;
      return next();
    }

    const userId = Number(payload?.sub);

    if (!userId) {
      req.user = null;
      return next();
    }

    const user = await getUserById(userId);

    if (!user) {
      req.user = null;
      return next();
    }

    if (user.isBanned) {
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error("Optional auth middleware error", { error: error.message });
    req.user = null;
    next();
  }
}
