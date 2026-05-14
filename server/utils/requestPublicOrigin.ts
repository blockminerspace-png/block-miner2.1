/**
 * Best-effort public origin for the current request (used in API hints).
 * @param {import("express").Request} req
 * @returns {string} e.g. https://tests.blockminer.space, or empty if unknown
 */
export function resolveRequestPublicOrigin(req) {
  if (!req || typeof req.get !== "function") return "";
  const xfHostRaw = req.get("x-forwarded-host") || "";
  const host = String(xfHostRaw.split(",")[0] || "").trim() || String(req.get("host") || "").trim();
  if (!host) return "";
  const xfProtoRaw = req.get("x-forwarded-proto") || "";
  const xfProto = String(xfProtoRaw.split(",")[0] || "").trim().toLowerCase();
  const proto =
    xfProto === "http" || xfProto === "https"
      ? xfProto
      : req.secure === true
        ? "https"
        : "http";
  return `${proto}://${host}`;
}
