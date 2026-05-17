/** Body for POST /api/auth/login (matches server `loginSchema`). */
export type AuthLoginRequestBody = {
  identifier: string;
  password: string;
  twoFactorToken?: string;
  twoFactorChallengeToken?: string;
  cfTurnstileToken?: string;
};

/** Subset of server JSON for failed auth responses (no secrets). */
export type AuthErrorResponse = {
  ok: false;
  error: string;
  message: string;
  code?: string;
  require2FA?: boolean;
  twoFactorChallengeToken?: string;
  twoFactorMethod?: string;
};
