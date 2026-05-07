/** Mining-room / backpack payloads used by the Inventory page. */

export interface RackMiner {
  id: number;
  minerId: number | null;
  minerName: string | null;
  hashRate: number | string;
  imageUrl: string | null;
  level: number;
  slotSize: number;
}

export interface UserRackSlot {
  id: number;
  position: number;
  installedAt: string | null;
  blockedByMinerId: number | null;
  miner: RackMiner | null;
}

export interface UnlockedRoom {
  id: number;
  roomNumber: number;
  unlocked: true;
  pricePaid: number;
  unlockedAt: string | Date | null;
  racks: UserRackSlot[];
}

export interface LockedRoomStub {
  roomNumber: number;
  unlocked: false;
  price: number;
  racks: UserRackSlot[];
}

export type RoomPayload = UnlockedRoom | LockedRoomStub;

export interface RoomsSummaryState {
  totalRacks: number;
  occupiedRacks: number;
  freeRacks: number;
}

export interface BackpackItem {
  id: number;
  minerId?: number | null;
  minerName?: string;
  hashRate?: number | string;
  slotSize?: number;
  imageUrl?: string | null;
  level?: number;
}

export interface InventoryStackGroup extends BackpackItem {
  quantity: number;
  items: BackpackItem[];
}

export interface SelectedSlotPayload {
  rack: UserRackSlot | null | undefined;
  miner: RackMiner | null;
  visualRackNumber: number;
  slotInRack: number;
}

export interface VisualRackGroup {
  rackNumber: number;
  slots: UserRackSlot[];
}

export interface MachineTipState {
  anchorEl: HTMLElement;
  slotKey: number | string;
  displayName: string;
  hashrateStr: string;
  slotSize: number;
}
