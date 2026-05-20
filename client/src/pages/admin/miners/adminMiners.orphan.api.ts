import { api } from '../../../store/auth';

export type OrphanRelinkCounts = {
  inventory: number;
  racks: number;
  vault: number;
  ownedMachines: number;
};

export type OrphanRelinkResult = {
  ok: boolean;
  minerName: string;
  catalogMinerId: number | null;
  catalogMinerName: string | null;
  normalizedMinerName: string | null;
  counts: OrphanRelinkCounts;
  message: string;
};

export type OrphanRelinkBatchResult = {
  ok: boolean;
  processed: number;
  linked: number;
  skipped: number;
  results: OrphanRelinkResult[];
};

export async function fetchOrphanMachineTypes() {
  const res = await api.get<{ ok: boolean; types?: unknown[] }>('/admin/miners/orphan-types');
  return res.data;
}

export async function relinkOrphanToCatalog(minerName: string) {
  const res = await api.post<OrphanRelinkResult>('/admin/miners/orphan-types/relink', {
    minerName,
    mode: 'catalog',
  });
  return res.data;
}

export async function repairOrphanEventType(minerName: string) {
  const res = await api.post<OrphanRelinkResult>('/admin/miners/orphan-types/relink', {
    minerName,
    mode: 'event',
  });
  return res.data;
}

export async function relinkAllOrphanCatalogMatches() {
  const res = await api.post<OrphanRelinkBatchResult>('/admin/miners/orphan-types/relink', { all: true });
  return res.data;
}
