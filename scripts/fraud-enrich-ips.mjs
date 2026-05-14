import prisma from "#server/src/db/prisma.js";
import { getCachedIpIntelligence } from "#server/services/ipIntelligenceService.js";
import { normalizeIp } from "#server/utils/clientIp.js";

const limit = Math.max(1, Math.min(100, Number(process.argv[2] || process.env.FRAUD_ENRICH_LIMIT || 25)));

try {
  const rows = await prisma.user.findMany({
    select: { registrationIp: true, ip: true },
    orderBy: { createdAt: "desc" },
    take: limit * 4,
  });
  const ips = [];
  const seen = new Set();
  for (const row of rows) {
    for (const raw of [row.registrationIp, row.ip]) {
      const ip = normalizeIp(raw);
      if (ip && !seen.has(ip)) {
        seen.add(ip);
        ips.push(ip);
      }
      if (ips.length >= limit) break;
    }
    if (ips.length >= limit) break;
  }
  for (const ip of ips) {
    const result = await getCachedIpIntelligence(prisma, ip);
    console.log(`${ip} ${result.providerType || "unknown"} ${result.asn ? `AS${result.asn}` : ""}`.trim());
  }
} finally {
  await prisma.$disconnect();
}
