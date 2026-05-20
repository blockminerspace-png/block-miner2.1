export const INVENTORY_ERROR = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_SLOT: "INVALID_SLOT",
  UNAUTHORIZED: "UNAUTHORIZED",
} as const;

export type InventoryErrorCode = (typeof INVENTORY_ERROR)[keyof typeof INVENTORY_ERROR];
