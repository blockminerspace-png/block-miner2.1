/**
 * Production gate for admin-keyed HTTP password reset routes.
 * @returns {boolean}
 */
export function isAdminKeyedPasswordResetApiEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  const v = String(process.env.ALLOW_ADMIN_PASSWORD_RESET_API || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
