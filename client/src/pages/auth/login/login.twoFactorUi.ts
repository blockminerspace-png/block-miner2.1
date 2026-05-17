/**
 * Maps backend login JSON to whether the UI should show the email 2FA step.
 * Never treat 2FA as required unless the server signals it (`require2FA` or known `code` values).
 */
export function responseRequiresTwoFactorStep(data: { require2FA?: boolean; code?: string }): boolean {
  if (data.require2FA === true) return true;
  const c = typeof data.code === 'string' ? data.code : '';
  return c === 'TWO_FACTOR_REQUIRED' || c === 'REQUIRE_2FA';
}
