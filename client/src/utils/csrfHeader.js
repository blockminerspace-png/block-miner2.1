/**
 * Reads the double-submit CSRF cookie set by the server (`blockminer_csrf`).
 * @returns {string}
 */
export function readCsrfCookie() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Headers for credentialed fetch calls that mutate state (must match server CSRF middleware).
 * @returns {Record<string, string>}
 */
export function csrfHeaderObject() {
  const token = readCsrfCookie();
  return token ? { "x-csrf-token": token } : {};
}
