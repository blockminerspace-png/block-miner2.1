import type { PrismaClient } from "@prisma/client";

export type BrokenMachineGroup = {
  minerName: string;
  hashRate: number;
  location: string;
  count: number;
  isEvent: boolean;
  autoMinerId: number | null;
  autoMinerName: string | null;
  catalogMatches: { id: number; name: string; baseHashRate: number }[];
  eventMatches: { id: number; name: string; hashRate: number }[];
};

export type BrokenMachineAssignResult = {
  ok: boolean;
  assigned: number;
  message: string;
};

export async function listBrokenMachineGroups(prisma: PrismaClient): Promise<BrokenMachineGroup[]> {
  const rows = await prisma.$queryRaw<
    Array<{ miner_name: string; hash_rate: number; location: string; cnt: bigint }>
  >`
    SELECT miner_name, hash_rate, location, COUNT(*)::bigint AS cnt
    FROM user_owned_machines
    WHERE miner_id IS NULL
    GROUP BY miner_name, hash_rate, location
    ORDER BY cnt DESC, miner_name, hash_rate
    LIMIT 200
  `;

  if (rows.length === 0) return [];

  const uniqueHashRates = [...new Set(rows.map((r) => r.hash_rate))];
  const catalogMiners = await prisma.miner.findMany({
    where: { baseHashRate: { in: uniqueHashRates } },
    select: { id: true, name: true, baseHashRate: true },
    orderBy: { id: "asc" },
  });
  const eventMiners = await prisma.eventMiner.findMany({
    where: { hashRate: { in: uniqueHashRates } },
    select: { id: true, name: true, hashRate: true },
    orderBy: { id: "asc" },
  });

  const byHashRate = new Map<number, { id: number; name: string; baseHashRate: number }[]>();
  for (const m of catalogMiners) {
    const list = byHashRate.get(m.baseHashRate) ?? [];
    list.push(m);
    byHashRate.set(m.baseHashRate, list);
  }
  const eventByHashRate = new Map<number, { id: number; name: string; hashRate: number }[]>();
  for (const e of eventMiners) {
    const list = eventByHashRate.get(e.hashRate) ?? [];
    list.push(e);
    eventByHashRate.set(e.hashRate, list);
  }

  const knownEventNames = new Set(eventMiners.map((e) => e.name.toLowerCase().trim()));

  const groups: BrokenMachineGroup[] = [];
  for (const row of rows) {
    const minerName = String(row.miner_name ?? "");
    const trimmed = minerName.trim();
    const isEvent = /^\[event\]/i.test(trimmed);

    if (isEvent) {
      const eventLabel = trimmed.replace(/^\[event\]\s*/i, "").toLowerCase().trim();
      // Functioning event miner — name resolves to a real EventMiner. Not broken.
      if (knownEventNames.has(eventLabel)) continue;
    }

    const matches = isEvent ? [] : (byHashRate.get(row.hash_rate) ?? []);
    const eventMatches = eventByHashRate.get(row.hash_rate) ?? [];
    const autoMiner = !isEvent && matches.length === 1 ? matches[0] : null;
    groups.push({
      minerName,
      hashRate: Number(row.hash_rate),
      location: String(row.location),
      count: Number(row.cnt),
      isEvent,
      autoMinerId: autoMiner?.id ?? null,
      autoMinerName: autoMiner?.name ?? null,
      catalogMatches: matches,
      eventMatches,
    });
  }
  return groups;
}

export async function assignMinerToGroup(
  prisma: PrismaClient,
  opts: { minerName: string; hashRate: number; location: string; catalogMinerId: number },
): Promise<BrokenMachineAssignResult> {
  const catalog = await prisma.miner.findUnique({
    where: { id: opts.catalogMinerId },
    select: { id: true, name: true },
  });
  if (!catalog) return { ok: false, assigned: 0, message: "Mineradora do catálogo não encontrada." };

  const where = {
    minerId: null,
    minerName: opts.minerName,
    hashRate: opts.hashRate,
    location: opts.location as "RACK" | "INVENTORY" | "WAREHOUSE",
  };

  const ownedRows = await prisma.userOwnedMachine.findMany({ where, select: { id: true } });
  const ownedIds = ownedRows.map((r) => r.id);
  if (ownedIds.length === 0) return { ok: false, assigned: 0, message: "Nenhuma máquina encontrada com esses critérios." };

  await prisma.$transaction(async (tx) => {
    await tx.userOwnedMachine.updateMany({
      where: { id: { in: ownedIds } },
      data: { minerId: catalog.id, minerName: catalog.name, imageUrl: null },
    });

    if (opts.location === "RACK") {
      await tx.userMiner.updateMany({
        where: { ownedMachineId: { in: ownedIds } },
        data: { minerId: catalog.id, imageUrl: null },
      });
    } else if (opts.location === "INVENTORY") {
      await tx.userInventory.updateMany({
        where: { ownedMachineId: { in: ownedIds } },
        data: { minerId: catalog.id, minerName: catalog.name, imageUrl: null },
      });
    } else if (opts.location === "WAREHOUSE") {
      await tx.userVault.updateMany({
        where: { ownedMachineId: { in: ownedIds } },
        data: { minerId: catalog.id, minerName: catalog.name, imageUrl: null },
      });
    }
  });

  await prisma.auditLog
    .create({
      data: {
        userId: null,
        action: "ADMIN_BROKEN_MACHINES_ASSIGN",
        label: "Broken machines assigned to catalog miner",
        source: "admin",
        severity: "info",
        metadata: { minerName: opts.minerName, hashRate: opts.hashRate, location: opts.location, catalogMinerId: catalog.id, count: ownedIds.length },
        relatedEntityType: "miner",
        relatedEntityId: String(catalog.id),
      },
    })
    .catch(() => null);

  return { ok: true, assigned: ownedIds.length, message: `${ownedIds.length} máquina(s) atribuída(s) a «${catalog.name}».` };
}

export async function assignEventMinerToGroup(
  prisma: PrismaClient,
  opts: { minerName: string; hashRate: number; location: string; eventMinerId: number },
): Promise<BrokenMachineAssignResult> {
  const event = await prisma.eventMiner.findUnique({
    where: { id: opts.eventMinerId },
    select: { id: true, name: true, hashRate: true },
  });
  if (!event) return { ok: false, assigned: 0, message: "Miner de evento não encontrado." };

  const canonicalName = `[Event] ${event.name}`;
  const where = {
    minerId: null,
    minerName: opts.minerName,
    hashRate: opts.hashRate,
    location: opts.location as "RACK" | "INVENTORY" | "WAREHOUSE",
  };

  const ownedRows = await prisma.userOwnedMachine.findMany({ where, select: { id: true } });
  const ownedIds = ownedRows.map((r) => r.id);
  if (ownedIds.length === 0) return { ok: false, assigned: 0, message: "Nenhuma máquina encontrada com esses critérios." };

  await prisma.$transaction(async (tx) => {
    await tx.userOwnedMachine.updateMany({
      where: { id: { in: ownedIds } },
      data: { minerName: canonicalName, imageUrl: null },
    });
    if (opts.location === "INVENTORY") {
      await tx.userInventory.updateMany({
        where: { ownedMachineId: { in: ownedIds } },
        data: { minerName: canonicalName, imageUrl: null },
      });
    } else if (opts.location === "WAREHOUSE") {
      await tx.userVault.updateMany({
        where: { ownedMachineId: { in: ownedIds } },
        data: { minerName: canonicalName, imageUrl: null },
      });
    } else if (opts.location === "RACK") {
      await tx.userMiner.updateMany({
        where: { ownedMachineId: { in: ownedIds } },
        data: { imageUrl: null },
      });
    }
  });

  await prisma.auditLog
    .create({
      data: {
        userId: null,
        action: "ADMIN_BROKEN_MACHINES_ASSIGN_EVENT",
        label: "Broken machines assigned to event miner",
        source: "admin",
        severity: "info",
        metadata: { minerName: opts.minerName, hashRate: opts.hashRate, location: opts.location, eventMinerId: event.id, count: ownedIds.length },
        relatedEntityType: "event_miner",
        relatedEntityId: String(event.id),
      },
    })
    .catch(() => null);

  return { ok: true, assigned: ownedIds.length, message: `${ownedIds.length} máquina(s) atribuída(s) ao evento «${event.name}».` };
}

export async function autoAssignAllBrokenMachines(prisma: PrismaClient): Promise<{
  ok: boolean;
  assigned: number;
  skipped: number;
  message: string;
}> {
  const groups = await listBrokenMachineGroups(prisma);
  let assigned = 0;
  let skipped = 0;

  for (const group of groups) {
    if (group.isEvent || !group.autoMinerId) { skipped += group.count; continue; }
    const result = await assignMinerToGroup(prisma, {
      minerName: group.minerName,
      hashRate: group.hashRate,
      location: group.location,
      catalogMinerId: group.autoMinerId,
    });
    if (result.ok) assigned += result.assigned;
    else skipped += group.count;
  }

  return {
    ok: true,
    assigned,
    skipped,
    message: `${assigned} máquina(s) atribuída(s) automaticamente. ${skipped} ignorada(s) (sem match único por H/s).`,
  };
}
