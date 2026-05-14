import type { User } from "@prisma/client";

/** Subset of `User` returned by `getUserById` (auth middleware). */
export type AuthSessionUser = Pick<
  User,
  "id" | "name" | "username" | "email" | "isBanned" | "polBalance" | "usdcBalance"
>;

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` / `authenticateTokenOptional` (see `getUserById` select). */
      user?: AuthSessionUser | null;
      /** Set by admin JWT middlewares. */
      admin?: { role: "admin" };
      /** Set by `requireCriticalIdempotency`. */
      criticalIdempotency?: {
        scope: string;
        idempotencyKey: string;
        requestHash: string;
      };
    }

    interface Locals {
      cspNonce?: string;
      csrfToken?: string;
    }
  }
}

export {};
