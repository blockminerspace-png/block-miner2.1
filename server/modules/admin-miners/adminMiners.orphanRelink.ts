import type { PrismaClient } from "@prisma/client";
import { parseEventMinerDisplayName } from "../../utils/eventMinerCatalogImage.js";
import { clearEventMinerOwnedImageSnapshots } from "../../utils/ownedMachineImage.js";
import { listOrphanMachineTypes } from "./adminMiners.orphanTypes.js";

const GENERIC_ORPHAN_LABELS = new Set(
  ["máquina", "maquina", "máquina custom", "maquina custom", "miner", "unknown miner", "gpu 1 ghs"].map((s) =>
    s.toLowerCase(),
  ),
);

function isSkippableOrphanNameForCatalogRelink(minerName: string): boolean {
  const label = String(minerName ?? "").trim();
  if (!label) return true;
  if (/^\[event\]/i.test(label)) return true;
  if (GENERIC_ORPHAN_LABELS.has(label.toLowerCase())) return true;
  return false;
}

export type OrphanRelinkCounts = {
  inventory: number;
  racks: number;
  vault: number;
  ownedMachines: number;
};

export type OrphanRelinkResult = {
  ok: boolean;
  minerName: string;
  catalogMinerId: number | null;
  catalogMinerName: string | null;
  normalizedMinerName: string | null;
  counts: OrphanRelinkCounts;
  message: string;
};

async function resolveCatalogMiner(prisma: PrismaClient, minerName: string) {
  const eventLabel = parseEventMinerDisplayName(minerName);
  const lookupName = (eventLabel ?? minerName).trim();
  if (!lookupName) return null;

  return prisma.miner.findFirst({
    where: { name: { equals: lookupName, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, slotSize: true, baseHashRate: true },
  });
}

async function relinkRowsForName(
  prisma: PrismaClient,
  minerName: string,
  catalog: { id: number; name: string },
): Promise<OrphanRelinkCounts> {
  const where = { minerId: null, minerName };
  const data = {
    minerId: catalog.id,
    minerName: catalog.name,
    imageUrl: null,
  };
  const rackData = { minerId: catalog.id, imageUrl: null };

  const ownedRows = await prisma.userOwnedMachine.findMany({
    where,
    select: { id: true },
  });
  const ownedIds = ownedRows.map((r) => r.id);

  return prisma.$transaction(async (tx) => {
    const inventory = await tx.userInventory.updateMany({ where, data });
    const vault = await tx.userVault.updateMany({ where, data });
    const ownedMachines = await tx.userOwnedMachine.updateMany({ where, data });
    const racks =
      ownedIds.length > 0
        ? await tx.userMiner.updateMany({
            where: { ownedMachineId: { in: ownedIds } },
            data: rackData,
          })
        : { count: 0 };

    return {
      inventory: inventory.count,
      racks: racks.count,
      vault: vault.count,
      ownedMachines: ownedMachines.count,
    };
  });
}

/** Link orphan instances to catalog Miner by display name match. */
export async function relinkOrphanMachineTypeToCatalog(
  prisma: PrismaClient,
  minerName: string,
): Promise<OrphanRelinkResult> {
  const label = String(minerName ?? "").trim();
  if (!label) {
    return {
      ok: false,
      minerName: label,
      catalogMinerId: null,
      catalogMinerName: null,
      normalizedMinerName: null,
      counts: { inventory: 0, racks: 0, vault: 0, ownedMachines: 0 },
      message: "Nome inválido.",
    };
  }

  const catalog = await resolveCatalogMiner(prisma, label);
  if (!catalog) {
    return {
      ok: false,
      minerName: label,
      catalogMinerId: null,
      catalogMinerName: null,
      normalizedMinerName: null,
      counts: { inventory: 0, racks: 0, vault: 0, ownedMachines: 0 },
      message: "Nenhuma mineradora no catálogo com esse nome.",
    };
  }

  const counts = await relinkRowsForName(prisma, label, catalog);
  const total = counts.inventory + counts.racks + counts.vault + counts.ownedMachines;
  if (total === 0) {
    return {
      ok: false,
      minerName: label,
      catalogMinerId: catalog.id,
      catalogMinerName: catalog.name,
      normalizedMinerName: catalog.name,
      counts,
      message: "Nenhuma instância órfã encontrada com esse nome.",
    };
  }

  await prisma.auditLog
    .create({
      data: {
        userId: null,
        action: "ADMIN_ORPHAN_RELINK_CATALOG",
        label: "Orphan machines linked to catalog",
        source: "admin",
        severity: "info",
        metadata: { minerName: label, catalogMinerId: catalog.id, counts },
        relatedEntityType: "miner",
        relatedEntityId: String(catalog.id),
      },
    })
    .catch(() => null);

  return {
    ok: true,
    minerName: label,
    catalogMinerId: catalog.id,
    catalogMinerName: catalog.name,
    normalizedMinerName: catalog.name,
    counts,
    message: `${total} instância(s) ligada(s) a «${catalog.name}» (#${catalog.id}).`,
  };
}

/** Normalize event display name + clear stale snapshots (no catalog miner_id). */
export async function repairOrphanEventMachineType(
  prisma: PrismaClient,
  minerName: string,
): Promise<OrphanRelinkResult> {
  const label = String(minerName ?? "").trim();
  const eventLabel = parseEventMinerDisplayName(label) ?? label.replace(/^\[event\]\s*/i, "").trim();
  if (!eventLabel) {
    return {
      ok: false,
      minerName: label,
      catalogMinerId: null,
      catalogMinerName: null,
      normalizedMinerName: null,
      counts: { inventory: 0, racks: 0, vault: 0, ownedMachines: 0 },
      message: "Nome de evento inválido.",
    };
  }

  const eventMiner = await prisma.eventMiner.findFirst({
    where: { name: { equals: eventLabel, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });
  if (!eventMiner) {
    return {
      ok: false,
      minerName: label,
      catalogMinerId: null,
      catalogMinerName: null,
      normalizedMinerName: null,
      counts: { inventory: 0, racks: 0, vault: 0, ownedMachines: 0 },
      message: "Miner de evento não encontrado em Ofertas/Eventos.",
    };
  }

  const canonicalName = `[Event] ${eventMiner.name}`;
  const counts: OrphanRelinkCounts = { inventory: 0, racks: 0, vault: 0, ownedMachines: 0 };

  if (label !== canonicalName) {
    const where = { minerId: null, minerName: label };
    const rename = { minerName: canonicalName, imageUrl: null };
    const ownedRows = await prisma.userOwnedMachine.findMany({ where, select: { id: true } });
    const ownedIds = ownedRows.map((r) => r.id);
    const [inv, vault, owned] = await prisma.$transaction([
      prisma.userInventory.updateMany({ where, data: rename }),
      prisma.userVault.updateMany({ where, data: rename }),
      prisma.userOwnedMachine.updateMany({ where, data: rename }),
    ]);
    counts.inventory = inv.count;
    counts.vault = vault.count;
    counts.ownedMachines = owned.count;
    if (ownedIds.length > 0) {
      // Racks: name lives on user_owned_machines; user_miners only gets miner_id cleared via snapshot.
      counts.racks = 0;
    }
  }

  await clearEventMinerOwnedImageSnapshots(prisma, eventMiner.name);

  const total = counts.inventory + counts.racks + counts.vault + counts.ownedMachines;
  return {
    ok: true,
    minerName: label,
    catalogMinerId: null,
    catalogMinerName: null,
    normalizedMinerName: canonicalName,
    counts,
    message:
      total > 0
        ? `${total} instância(s) renomeada(s) para «${canonicalName}»; imagens sincronizam com o evento.`
        : `Snapshots limpos; imagem passa a vir do evento «${eventMiner.name}».`,
  };
}

export async function repairAllOrphanEventMachineTypes(prisma: PrismaClient): Promise<{
  ok: boolean;
  processed: number;
  repaired: number;
  skipped: number;
  results: OrphanRelinkResult[];
}> {
  const types = await listOrphanMachineTypes(prisma, 80);
  const results: OrphanRelinkResult[] = [];
  let repaired = 0;
  let skipped = 0;

  for (const row of types) {
    if (row.kind !== "event") {
      skipped += 1;
      continue;
    }
    const result = await repairOrphanEventMachineType(prisma, row.minerName);
    results.push(result);
    if (result.ok) repaired += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    processed: types.length,
    repaired,
    skipped,
    results,
  };
}

/** Scan every distinct orphan display name (not only top-N panel list) and link when miners.name matches. */
export async function relinkAllOrphanInstancesByCatalogNameMatch(prisma: PrismaClient): Promise<{
  ok: boolean;
  processed: number;
  linked: number;
  skipped: number;
  results: OrphanRelinkResult[];
}> {
  const rows = await prisma.$queryRaw<Array<{ miner_name: string }>>`
    SELECT DISTINCT miner_name
    FROM (
      SELECT miner_name FROM user_inventory WHERE miner_id IS NULL
      UNION
      SELECT miner_name FROM user_vault WHERE miner_id IS NULL
      UNION
      SELECT uom.miner_name
      FROM user_miners um
      INNER JOIN user_owned_machines uom ON uom.id = um.owned_machine_id
      WHERE um.miner_id IS NULL
      UNION
      SELECT miner_name FROM user_owned_machines WHERE miner_id IS NULL
    ) orphan_names
    ORDER BY miner_name ASC
  `;

  const results: OrphanRelinkResult[] = [];
  let linked = 0;
  let skipped = 0;

  for (const row of rows) {
    const minerName = String(row.miner_name ?? "").trim();
    if (isSkippableOrphanNameForCatalogRelink(minerName)) {
      skipped += 1;
      continue;
    }
    const catalog = await resolveCatalogMiner(prisma, minerName);
    if (!catalog) {
      skipped += 1;
      continue;
    }
    const result = await relinkOrphanMachineTypeToCatalog(prisma, minerName);
    results.push(result);
    if (result.ok) linked += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    processed: rows.length,
    linked,
    skipped,
    results,
  };
}

export async function relinkAllOrphanTypesWithCatalogMatch(prisma: PrismaClient): Promise<{
  ok: boolean;
  processed: number;
  linked: number;
  skipped: number;
  results: OrphanRelinkResult[];
}> {
  const types = await listOrphanMachineTypes(prisma, 80);
  const results: OrphanRelinkResult[] = [];
  let linked = 0;
  let skipped = 0;

  for (const row of types) {
    if (!row.catalogMinerId) {
      skipped += 1;
      continue;
    }
    const result = await relinkOrphanMachineTypeToCatalog(prisma, row.minerName);
    results.push(result);
    if (result.ok) linked += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    processed: types.length,
    linked,
    skipped,
    results,
  };
}
