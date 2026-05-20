import type { PrismaClient } from "@prisma/client";
import { parseEventMinerDisplayName } from "../../utils/eventMinerCatalogImage.js";

const GENERIC_LABELS = new Set(
  ["máquina", "maquina", "máquina custom", "maquina custom", "miner", "unknown miner", "gpu 1 ghs"].map((s) =>
    s.toLowerCase(),
  ),
);

export type OrphanMachineTypeRow = {
  minerName: string;
  inventoryCount: number;
  rackCount: number;
  vaultCount: number;
  totalCount: number;
  kind: "orphan" | "event" | "generic";
  eventMinerId: number | null;
  catalogMinerId: number | null;
  catalogMinerName: string | null;
  hint: string;
};

export async function listOrphanMachineTypes(prisma: PrismaClient, limit = 60): Promise<OrphanMachineTypeRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{ miner_name: string; inventory_count: bigint; rack_count: bigint; vault_count: bigint }>
  >`
    SELECT
      miner_name,
      COUNT(*) FILTER (WHERE src = 'inv')::bigint AS inventory_count,
      COUNT(*) FILTER (WHERE src = 'rack')::bigint AS rack_count,
      COUNT(*) FILTER (WHERE src = 'vault')::bigint AS vault_count
    FROM (
      SELECT miner_name, 'inv' AS src FROM user_inventory WHERE miner_id IS NULL
      UNION ALL
      SELECT uom.miner_name, 'rack' AS src
      FROM user_miners um
      INNER JOIN user_owned_machines uom ON uom.id = um.owned_machine_id
      WHERE um.miner_id IS NULL
      UNION ALL
      SELECT miner_name, 'vault' AS src FROM user_vault WHERE miner_id IS NULL
      UNION ALL
      SELECT miner_name, 'owned' AS src FROM user_owned_machines WHERE miner_id IS NULL
    ) orphan_rows
    GROUP BY miner_name
    ORDER BY (
      COUNT(*) FILTER (WHERE src = 'inv') +
      COUNT(*) FILTER (WHERE src = 'rack') +
      COUNT(*) FILTER (WHERE src = 'vault')
    ) DESC
    LIMIT ${limit}
  `;

  const eventMiners = await prisma.eventMiner.findMany({
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
  const eventByNorm = new Map<string, { id: number; name: string }>();
  for (const em of eventMiners) {
    const key = em.name.trim().toLowerCase();
    if (!eventByNorm.has(key)) eventByNorm.set(key, em);
  }

  const catalogMiners = await prisma.miner.findMany({
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
  const catalogByNorm = new Map<string, { id: number; name: string }>();
  for (const m of catalogMiners) {
    const key = m.name.trim().toLowerCase();
    if (!catalogByNorm.has(key)) catalogByNorm.set(key, m);
  }

  const out: OrphanMachineTypeRow[] = [];
  for (const row of rows) {
    const minerName = String(row.miner_name ?? "").trim();
    if (!minerName) continue;
    const inventoryCount = Number(row.inventory_count) || 0;
    const rackCount = Number(row.rack_count) || 0;
    const vaultCount = Number(row.vault_count) || 0;
    const totalCount = inventoryCount + rackCount + vaultCount;
    if (totalCount <= 0) continue;

    const eventLabel = parseEventMinerDisplayName(minerName);
    const normPlain = (eventLabel ?? minerName).trim().toLowerCase();
    const isGeneric = GENERIC_LABELS.has(minerName.trim().toLowerCase()) || GENERIC_LABELS.has(normPlain);

    const eventMatch = eventByNorm.get(normPlain) ?? null;
    const catalogMatch = catalogByNorm.get(normPlain) ?? null;

    let kind: OrphanMachineTypeRow["kind"] = "orphan";
    if (isGeneric) kind = "generic";
    else if (eventLabel || eventMatch) kind = "event";

    let hint = "Sem entrada no catálogo Miners — jogadores não veem imagem atualizada pelo admin de Miners.";
    if (kind === "event") {
      hint = eventMatch
        ? `Editar imagem em Ofertas/Eventos → miner «${eventMatch.name}» (id ${eventMatch.id}).`
        : `Nome de evento «${eventLabel ?? normPlain}» — criar/ajustar em Ofertas/Eventos.`;
    } else if (catalogMatch) {
      hint = `Existe no catálogo como «${catalogMatch.name}» (#${catalogMatch.id}) — instâncias antigas sem miner_id; use reparar ou reenviar do admin.`;
    } else if (kind === "generic") {
      hint = "Rótulo genérico (legado) — não é uma mineradora do catálogo; migre ou renomeie no inventário.";
    }

    out.push({
      minerName,
      inventoryCount,
      rackCount,
      vaultCount,
      totalCount,
      kind,
      eventMinerId: eventMatch?.id ?? null,
      catalogMinerId: catalogMatch?.id ?? null,
      catalogMinerName: catalogMatch?.name ?? null,
      hint,
    });
  }
  return out;
}
