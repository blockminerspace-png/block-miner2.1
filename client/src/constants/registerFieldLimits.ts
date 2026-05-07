/**
 * Must match server/validation/registerBodySchema.js (registration hard limits).
 */
export const REGISTER_USERNAME_MIN = 3;
export const REGISTER_USERNAME_MAX = 24;
export const REGISTER_EMAIL_MAX_LEN = 254;
export const REGISTER_PASSWORD_MIN_LEN = 8;
/** bcrypt only uses the first 72 bytes; cap avoids abuse and matches verification. */
export const REGISTER_PASSWORD_MAX_LEN = 72;
export const REGISTER_REF_CODE_MAX_LEN = 32;
