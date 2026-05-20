import { z } from "zod";

const RACK_SLOT_INDEX_MAX = 79;

export const installInventoryBodySchema = z
  .object({
    slotIndex: z.coerce.number().int().min(0).max(RACK_SLOT_INDEX_MAX),
    inventoryId: z.coerce.number().int().positive(),
  })
  .strict();

export const removeInventoryBodySchema = z
  .object({
    inventoryId: z.coerce.number().int().positive(),
  })
  .strict();
