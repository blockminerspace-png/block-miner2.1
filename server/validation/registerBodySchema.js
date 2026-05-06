import { z } from "zod";
import { isRegisterAllowedEmailDomain } from "./registerAllowedEmailDomains.js";

export const REGISTER_USERNAME_MIN = 3;
export const REGISTER_USERNAME_MAX = 24;
export const REGISTER_EMAIL_MAX_LEN = 254;
export const REGISTER_PASSWORD_MIN_LEN = 8;
/** bcrypt only uses the first 72 bytes; cap avoids abuse and matches verification. */
export const REGISTER_PASSWORD_MAX_LEN = 72;
export const REGISTER_REF_CODE_MAX_LEN = 32;

/**
 * POST /auth/register JSON body. refCode empty string becomes undefined after parse.
 */
export const registerBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(REGISTER_USERNAME_MIN, "auth.register.errors.username_too_short")
    .max(REGISTER_USERNAME_MAX, "auth.register.errors.username_too_long")
    .regex(/^[a-zA-Z0-9._-]+$/, "auth.register.errors.username_invalid"),
  email: z
    .string()
    .trim()
    .min(1, "auth.register.errors.email_invalid")
    .max(REGISTER_EMAIL_MAX_LEN, "auth.register.errors.email_too_long")
    .email("auth.register.errors.email_invalid")
    .refine((addr) => isRegisterAllowedEmailDomain(addr), {
      message: "auth.register.errors.email_provider_not_allowed",
    }),
  password: z
    .string()
    .min(REGISTER_PASSWORD_MIN_LEN, "auth.register.errors.password_min")
    .max(REGISTER_PASSWORD_MAX_LEN, "auth.register.errors.password_max"),
  refCode: z.preprocess(
    (v) => (v === undefined || v === null ? "" : String(v)),
    z
      .string()
      .trim()
      .max(REGISTER_REF_CODE_MAX_LEN, "auth.register.errors.ref_code_too_long")
      .regex(/^$|^[a-zA-Z0-9]+$/, "auth.register.errors.ref_code_invalid")
      .transform((s) => (s === "" ? undefined : s)),
  ),
  acceptTerms: z.boolean().refine((value) => value === true, {
    message: "validation.errors.termsRequired",
  }),
  cfTurnstileToken: z.string().trim().optional(),
});
