import { z } from "zod";

/** Aligned with client `authInputGuards` + bcrypt 72-byte cap. */
export const LOGIN_BODY_IDENTIFIER_MAX = 254;
export const LOGIN_BODY_PASSWORD_MAX = 72;

export const loginSchema = z.object({
  identifier: z
    .string()
    .max(LOGIN_BODY_IDENTIFIER_MAX, "Login muito longo.")
    .transform((s) =>
      String(s ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim(),
    )
    .pipe(z.string().min(1, "Email ou username é obrigatório")),
  password: z
    .string()
    .max(LOGIN_BODY_PASSWORD_MAX, "Senha muito longa.")
    .transform((s) => String(s ?? "").replace(/\u0000/g, ""))
    .pipe(z.string().min(1, "Senha é obrigatória")),
  twoFactorToken: z.string().trim().max(32).optional(),
  twoFactorChallengeToken: z.string().trim().max(512).optional(),
  cfTurnstileToken: z.string().trim().max(4096).optional(),
});
