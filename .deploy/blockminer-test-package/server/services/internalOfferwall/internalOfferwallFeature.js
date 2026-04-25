/**
 * Global kill-switch for the internal offerwall feature (user + public APIs).
 * @returns {boolean}
 */
export function isInternalOfferwallEnabled() {
  const v = String(process.env.INTERNAL_OFFERWALL_ENABLED ?? "1").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}
