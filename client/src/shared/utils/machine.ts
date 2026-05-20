export const SLOTS_PER_RACK = 8;
export const RACKS_COUNT = 24;
export const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";

type LooseRecord = Record<string, unknown>;

function asRecord(machine: object | null | undefined): LooseRecord | null | undefined {
  return machine as LooseRecord | null | undefined;
}

export function getGlobalSlotIndex(rackIndex: number, localSlotIndex: number): number {
    return (rackIndex - 1) * SLOTS_PER_RACK + localSlotIndex;
}

export function formatHashrate(value: unknown): string {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue) || safeValue === 0) return "0 H/s";

    const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s"];
    let scaled = safeValue;
    let unitIndex = 0;

    while (scaled >= 1000 && unitIndex < units.length - 1) {
        scaled /= 1000;
        unitIndex += 1;
    }

    const precision = scaled >= 100 ? 1 : 2;
    return `${scaled.toFixed(precision)} ${units[unitIndex]}`;
}

function readSlotSize(machine: LooseRecord | null | undefined): number | null {
    const a = machine?.slotSize;
    const b = machine?.slot_size;
    if (Number.isInteger(a)) return a as number;
    if (Number.isInteger(b)) return b as number;
    return null;
}

export function getMachineDescriptor(machine: object | null | undefined): {
    name: string;
    image: string | null;
    size: number;
} {
    const m = asRecord(machine);
    const hashRate = Number(m?.hashRate || m?.hash_rate || 0);
    const slotSize = readSlotSize(m ?? undefined);

    let defaultName = "Basic Miner";
    let size = slotSize || 1;

    if (hashRate >= 1000) {
        defaultName = "Quantum Miner";
        size = slotSize || 2;
    } else if (hashRate >= 500) {
        defaultName = "Elite Miner";
        size = slotSize || 2;
    } else if (hashRate >= 100) {
        defaultName = "Pro Miner";
        size = slotSize || 2;
    } else if (hashRate >= 50) {
        defaultName = "Advanced Miner";
        size = slotSize || 1;
    } else if (hashRate >= 10) {
        defaultName = "Standard Miner";
        size = slotSize || 1;
    }

    const rawImage = m?.imageUrl ?? m?.image_url;
    let image: string | null = null;
    if (typeof rawImage === "string" && rawImage.trim() !== "") {
        image = rawImage.trim();
    }

    return {
        name: String(m?.minerName || m?.miner_name || m?.name || defaultName),
        image,
        size,
    };
}

export function getMachineBySlot<T extends object>(
    slotIndex: number,
    machines: readonly T[],
): (T & { isSecondSlot?: boolean }) | null {
    const machine = machines.find((row) => {
      const m = asRecord(row);
      return m?.slotIndex === slotIndex || m?.slot_index === slotIndex;
    });
    if (machine) {
        return machine as T & { isSecondSlot?: boolean };
    }

    const previousMachine = machines.find((row) => {
        const m = asRecord(row);
        const pSlot = m?.slotIndex !== undefined ? m.slotIndex : m?.slot_index;
        if (pSlot !== slotIndex - 1) return false;

        const descriptor = getMachineDescriptor(m as object);
        return descriptor.size === 2;
    });

    if (previousMachine) {
        return { ...previousMachine, isSecondSlot: true } as T & { isSecondSlot: true };
    }

    return null;
}
