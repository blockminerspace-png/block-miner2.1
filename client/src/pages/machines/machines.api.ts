import { api } from '../../store/auth';

/** Endpoints usados pela tela Minhas Máquinas (`/inventory`). Prefixo base: `/api`. */
export const MACHINES_API = {
  rooms: '/rooms',
  inventory: '/inventory',
  roomsBuy: '/rooms/buy',
  rackInstall: '/rooms/rack/install',
  rackUninstall: '/rooms/rack/uninstall',
  rackUninstallBatch: '/rooms/rack/uninstall-batch',
  vaultMove: '/vault/move-to-vault',
} as const;

export function getRooms(signal?: AbortSignal) {
  return api.get(MACHINES_API.rooms, { timeout: 25000, signal });
}

export function getInventory(signal?: AbortSignal) {
  return api.get(MACHINES_API.inventory, { timeout: 25000, signal });
}
