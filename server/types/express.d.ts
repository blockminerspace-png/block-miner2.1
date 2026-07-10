import type { User } from "@prisma/client";

/** Subset of `User` returned by `getUserById` (auth middleware). */
export type AuthSessionUser = Pick<
  User,
  "id" | "name" | "username" | "email" | "isBanned" | "polBalance" | "usdcBalance"
>;

export interface AdminContext {
  role: string;
  adminId?: number;
  sessionId?: string;
  email?: string;
  name?: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` / `authenticateTokenOptional` (see `getUserById` select). */
      user?: AuthSessionUser | null;
      /** Set by admin JWT middlewares. */
      admin?: AdminContext;
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
