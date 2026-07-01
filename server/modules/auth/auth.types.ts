/**
 * Public-safe user payload for JSON responses (login, register, session).
 * Never add password hashes, tokens, or secrets here.
 */
export type AuthPublicUserDto = {
  id: number;
  name: string;
  username: string | null;
  email: string;
  hasReferral?: boolean;
  energyBlocked?: boolean;
  energyUnpaidDays?: number;
};
