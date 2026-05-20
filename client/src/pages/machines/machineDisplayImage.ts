import {
  resolveOwnedMachineImageUrl,
  type MachineImageSource,
} from "../../shared/utils/machineImage";

export type MachineImageRow = {
  imageUrl?: string | null;
  imageSource?: MachineImageSource;
};

/** Resolved URL for UI (null → MachineImage placeholder). */
export function getMachineDisplayImageUrl(row: MachineImageRow): string | null {
  if (row.imageSource) {
    return resolveOwnedMachineImageUrl({
      apiImageUrl: row.imageUrl ?? null,
      apiImageSource: row.imageSource,
    }).imageUrl;
  }
  return resolveOwnedMachineImageUrl({ rowImageUrl: row.imageUrl ?? null }).imageUrl;
}
