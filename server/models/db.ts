/**
 * Legacy import path for server/models/* — use centralized Prisma only.
 * Raw SQL helpers ($queryRawUnsafe) were removed; import prisma from `../src/db/prisma.js`.
 */
export { default } from "../src/db/prisma.js";
