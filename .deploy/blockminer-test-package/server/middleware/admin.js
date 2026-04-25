import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AdminAuth");

function parseAllowlist(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

const allowedEmails = parseAllowlist(process.env.ADMIN_EMAILS);

function envFlag(name) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Never open admin user routes by default, even in development. */
const allowOpenAdminUserRoutes =
  process.env.NODE_ENV !== "production" && envFlag("ALLOW_OPEN_ADMIN_USER_ROUTES");

export function requireAdmin(req, res, next) {
  if (allowOpenAdminUserRoutes) {
    logger.warn("ALLOW_OPEN_ADMIN_USER_ROUTES is enabled: any logged-in user passes requireAdmin (dev only).");
    next();
    return;
  }

  if (allowedEmails.length === 0) {
    logger.warn("Admin access denied: ADMIN_EMAILS not configured");
    res.status(403).json({ ok: false, message: "Admin access not configured." });
    return;
  }

  const email = String(req.user?.email || "").trim().toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    res.status(403).json({ ok: false, message: "Forbidden" });
    return;
  }

  next();
}
