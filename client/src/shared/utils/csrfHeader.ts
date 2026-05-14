/**
 * Reads the double-submit CSRF cookie set by the server (`blockminer_csrf`).
 */
export function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Headers for credentialed fetch calls that mutate state (must match server CSRF middleware).
 */
export function csrfHeaderObject(): Record<string, string> {
  const token = readCsrfCookie();
  const out: Record<string, string> = {};
  if (token) out['x-csrf-token'] = token;
  return out;
}
