import { z } from "zod";

export const installMinerBodySchema = z
  .object({
    rackId: z.coerce.number().int().positive(),
    inventoryId: z.coerce.number().int().positive(),
  })
  .strict();

export const uninstallMinerBodySchema = z
  .object({
    rackId: z.coerce.number().int().positive(),
  })
  .strict();

export const uninstallMinerBatchBodySchema = z
  .object({
    rackIds: z.array(z.coerce.number().int().positive()).min(1),
  })
  .strict();

export function normalizeRackIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}
