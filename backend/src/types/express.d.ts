import type { User } from "@prisma/client";

/**
 * Shape attached by `server/middleware/auth.js` (`requireAuth`, optional auth, etc.).
 * Full Prisma `User` matches runtime; never return password fields in JSON from new code.
 */
declare global {
  namespace Express {
    interface Request {
      user?: User | null;
    }
  }
}

export {};
