import { z } from "zod";

/** Max slot index for legacy rack retrieve path (matches vaultController). */
const RACK_SLOT_INDEX_MAX = 79;

const VAULT_BULK_MAX = 120;

export const moveToVaultBodySchema = z
  .object({
    source: z.enum(["inventory", "rack"]),
    itemId: z.coerce.number().int().positive().optional(),
    itemIds: z.array(z.coerce.number().int().positive()).min(1).max(VAULT_BULK_MAX).optional(),
    cfTurnstileToken: z.string().trim().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.source === "rack") {
      if (data.itemIds != null) {
        ctx.addIssue({ code: "custom", path: ["itemIds"], message: "itemIds is not allowed for rack moves" });
      }
      if (data.itemId == null) {
        ctx.addIssue({ code: "custom", path: ["itemId"], message: "itemId is required for rack moves" });
      }
      return;
    }
    const hasId = data.itemId != null;
    const hasIds = data.itemIds != null && data.itemIds.length > 0;
    if (hasId === hasIds) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of itemId or itemIds for inventory moves",
      });
    }
  });

export const retrieveFromVaultBodySchema = z.union([
  z
    .object({
      destination: z.literal("inventory"),
      vaultId: z.coerce.number().int().positive(),
      cfTurnstileToken: z.string().trim().optional(),
    })
    .strict(),
  z
    .object({
      destination: z.literal("inventory"),
      vaultIds: z.array(z.coerce.number().int().positive()).min(1).max(VAULT_BULK_MAX),
      cfTurnstileToken: z.string().trim().optional(),
    })
    .strict(),
  z
    .object({
      destination: z.literal("rack"),
      vaultId: z.coerce.number().int().positive(),
      slotIndex: z.coerce.number().int().min(0).max(RACK_SLOT_INDEX_MAX),
      cfTurnstileToken: z.string().trim().optional(),
    })
    .strict(),
]);
