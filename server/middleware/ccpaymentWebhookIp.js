/**
 * Optional IP allowlist for CCPayment webhook source addresses.
 * Set CCPAYMENT_ALLOWED_IPS (comma-separated) to add IPs; official CCPayment egress IPs are always included.
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
 * Official CCPayment egress IPs plus any extra IPs from CCPAYMENT_ALLOWED_IPS (deduped).
 * Extra IPs cover proxies, staging hooks, or merchant allowlist rows without dropping CCPayment.
 *
 * @param {string | undefined} envAllowedIps
 * @returns {string[]}
 */
export function resolveCcpaymentWebhookAllowlist(envAllowedIps) {
  const extra = parseIpList(envAllowedIps);
  if (extra && extra.length > 0) {
    return [...new Set([...DEFAULT_CC_IPS, ...extra])];
  }
  return [...DEFAULT_CC_IPS];
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

  const allow = resolveCcpaymentWebhookAllowlist(process.env.CCPAYMENT_ALLOWED_IPS);

  const ip = getWebhookClientIp(req).replace(/^::ffff:/, "");
  const ok = allow.some((a) => a === ip);

  if (!ok) {
    res.status(403).type("text/plain").send("forbidden");
    return;
  }
  next();
}
