export const REGISTER_ALLOWED_EMAIL_DOMAINS = Object.freeze(
  new Set([
    'gmail.com',
    'outlook.com',
    'hotmail.com',
    'yahoo.com',
    'icloud.com',
    'proton.me',
    'protonmail.com',
    'tuta.com',
    'tutanota.com',
  ]),
);

export function registerEmailDomain(email: unknown): string {
  const s = String(email ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 0 || at === s.length - 1) return '';
  return s.slice(at + 1).toLowerCase();
}

export function isRegisterAllowedEmailDomain(email: unknown): boolean {
  const d = registerEmailDomain(email);
  return d !== '' && REGISTER_ALLOWED_EMAIL_DOMAINS.has(d);
}
