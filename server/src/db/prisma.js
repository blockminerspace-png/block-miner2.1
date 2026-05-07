import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const connectionString = process.env.DATABASE_URL;

function poolMaxConnections() {
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
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export default prisma;
