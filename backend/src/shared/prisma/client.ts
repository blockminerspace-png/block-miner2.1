import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

function poolMaxConnections(): number {
  const n = Number.parseInt(String(process.env.PG_POOL_MAX || "20").trim(), 10);
  if (Number.isFinite(n) && n >= 2) return Math.min(n, 100);
  return 20;
}

const pool = new pg.Pool({
  connectionString,
  max: poolMaxConnections(),
  idleTimeoutMillis: Number.parseInt(String(process.env.PG_POOL_IDLE_MS || "30000").trim(), 10) || 30000,
  connectionTimeoutMillis:
    Number.parseInt(String(process.env.PG_POOL_CONNECTION_TIMEOUT_MS || "10000").trim(), 10) || 10000,
});

import { recordPrismaQuery } from "#server/shared/observability/metricsRegistry.js";

const adapter = new PrismaPg(pool);
const basePrisma = new PrismaClient({ adapter });

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const start = process.hrtime.bigint();
        const result = await query(args);
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        recordPrismaQuery(String(model), String(operation), durationMs);
        return result;
      },
    },
  },
});

export default prisma;
