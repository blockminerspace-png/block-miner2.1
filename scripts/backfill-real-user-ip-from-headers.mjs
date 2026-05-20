#!/usr/bin/env node
/**
 * Documents why stored user IPs cannot be backfilled from HTTP headers.
 * Historical rows only contain the IP captured at login/register time.
 *
 * Dry-run (default): reports how many users have infrastructure IPs stored.
 */
import { PrismaClient } from "@prisma/client";
import { isInfrastructureIp, normalizeIp } from "#server/modules/ip-intelligence/ipAddress.js";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ ip: { not: null } }, { registrationIp: { not: null } }] },
    select: { id: true, ip: true, registrationIp: true },
    take: 50000,
  });

  let infraLast = 0;
  let infraReg = 0;
  for (const u of users) {
    if (u.ip && isInfrastructureIp(normalizeIp(u.ip) || u.ip)) infraLast += 1;
    if (u.registrationIp && isInfrastructureIp(normalizeIp(u.registrationIp) || u.registrationIp)) infraReg += 1;
  }

  console.log(
    JSON.stringify({
      mode: "dry_run",
      scanned: users.length,
      infrastructure_last_ip: infraLast,
      infrastructure_registration_ip: infraReg,
      backfill_possible: false,
      reason:
        "HTTP headers are not persisted per session; only fix forward path (TRUST_PROXY + proxy headers). New logins will store public IPs.",
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
