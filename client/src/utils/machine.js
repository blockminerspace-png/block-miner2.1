export const SLOTS_PER_RACK = 8;
export const RACKS_COUNT = 10;
export const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";

export function getGlobalSlotIndex(rackIndex, localSlotIndex) {
    return (rackIndex - 1) * SLOTS_PER_RACK + localSlotIndex;
}

export function formatHashrate(value) {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue) || safeValue === 0) return "0 H/s";
    
    const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s"];
    let scaled = safeValue;
    let unitIndex = 0;
    
    while (scaled >= 1000 && unitIndex < units.length - 1) {
        scaled /= 1000;
        unitIndex += 1;
    }
    
    // Ajusta a precisão: se for muito grande, sem decimais. Se for pequeno, até 2 decimais.
    const precision = scaled >= 100 ? 1 : 2;
    return `${scaled.toFixed(precision)} ${units[unitIndex]}`;
}

export function getMachineDescriptor(machine) {
    const hashRate = Number(machine?.hashRate || machine?.hash_rate || 0);
    const slotSize = Number.isInteger(machine?.slotSize) ? machine.slotSize : (Number.isInteger(machine?.slot_size) ? machine.slot_size : null);

    // Default name mapping based on hash rate
    let defaultName = "Basic Miner";
    let image = "/machines/1.png";
    let size = slotSize || 1;

    if (hashRate >= 1000) {
        defaultName = "Quantum Miner";
        image = "/machines/reward3.png";
        size = slotSize || 2;
    } else if (hashRate >= 500) {
        defaultName = "Elite Miner";
        image = "/machines/reward2.png";
        size = slotSize || 2;
    } else if (hashRate >= 100) {
        defaultName = "Pro Miner";
        image = "/machines/reward1.png";
        size = slotSize || 2;
    } else if (hashRate >= 50) {
        defaultName = "Advanced Miner";
        image = "/machines/3.png";
        size = slotSize || 1;
    } else if (hashRate >= 10) {
        defaultName = "Standard Miner";
        image = "/machines/2.png";
        size = slotSize || 1;
    }

    // Use machine's own name and image if they exist, otherwise fallback to defaults
    return {
        name: machine?.minerName || machine?.miner_name || machine?.name || defaultName,
        image: machine?.imageUrl || machine?.image_url || image,
        size: size
    };
}

export function getMachineBySlot(slotIndex, machines) {
    // Check if this slot is the start of a machine
    const machine = machines.find((m) => m.slotIndex === slotIndex || m.slot_index === slotIndex);
    if (machine) {
        return machine;
    }

    // Check if this slot is occupied by a 2-cell machine from the previous slot
    const previousMachine = machines.find((m) => {
        const pSlot = m.slotIndex !== undefined ? m.slotIndex : m.slot_index;
        if (pSlot !== slotIndex - 1) return false;

        const descriptor = getMachineDescriptor(m);
        return descriptor.size === 2;
    });

    if (previousMachine) {
        return { ...previousMachine, isSecondSlot: true };
    }

    return null;
}
