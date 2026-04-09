/**
 * Optional IP allowlist for CCPayment webhook source addresses.
 * Set CCPAYMENT_ALLOWED_IPS (comma-separated). When empty, only default CCPayment IPs apply if provided via env.
 */

const DEFAULT_CC_IPS = ["54.150.123.157", "35.72.150.75", "18.176.186.244"];

function parseIpList(raw) {
  if (!raw || !String(raw).trim()) return null;
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
export function getWebhookClientIp(req) {
  if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
      return xff.split(",")[0].trim();
    }
  }
  return req.ip || req.socket?.remoteAddress || "";
}

/**
 * Express middleware: 403 if IP not in allowlist (when enforcement enabled).
 */
export function ccpaymentWebhookIpWhitelist(req, res, next) {
  const skip = process.env.CCPAYMENT_SKIP_IP_CHECK === "1" || process.env.CCPAYMENT_SKIP_IP_CHECK === "true";
  if (skip) {
    next();
    return;
  }

  const envList = parseIpList(process.env.CCPAYMENT_ALLOWED_IPS);
  const allow = envList && envList.length > 0 ? envList : DEFAULT_CC_IPS;

  const ip = getWebhookClientIp(req).replace(/^::ffff:/, "");
  const ok = allow.some((a) => a === ip);

  if (!ok) {
    res.status(403).type("text/plain").send("forbidden");
    return;
  }
  next();
}
