/**
 * Registration allowlist: major providers + privacy-focused mail (product policy).
 * Domain match is case-insensitive on the host after the final "@".
 */
export const REGISTER_ALLOWED_EMAIL_DOMAINS = Object.freeze(
  new Set([
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "tuta.com",
    "tutanota.com",
  ]),
);

/**
 * @param {string} email trimmed address
 * @returns {string} lowercased domain or empty if no @
 */
export function registerEmailDomain(email) {
  const s = String(email ?? "").trim();
  const at = s.lastIndexOf("@");
  if (at < 0 || at === s.length - 1) return "";
  return s.slice(at + 1).toLowerCase();
}

/**
 * @param {string} email
 */
export function isRegisterAllowedEmailDomain(email) {
  const d = registerEmailDomain(email);
  return d !== "" && REGISTER_ALLOWED_EMAIL_DOMAINS.has(d);
}
