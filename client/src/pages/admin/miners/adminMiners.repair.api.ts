import { api } from '../../../store/auth';

export type BrokenMachineGroup = {
  minerName: string;
  hashRate: number;
  location: string;
  count: number;
  autoMinerId: number | null;
  autoMinerName: string | null;
  catalogMatches: { id: number; name: string; baseHashRate: number }[];
};

export type AssignResult = {
  ok: boolean;
  assigned: number;
  message: string;
};

export async function fetchBrokenMachineGroups(): Promise<{ ok: boolean; groups: BrokenMachineGroup[]; total: number }> {
  const res = await api.get<{ ok: boolean; groups: BrokenMachineGroup[]; total: number }>('/admin/miners/broken-machines');
  return res.data;
}

export async function assignMinerToGroup(opts: {
  minerName: string;
  hashRate: number;
  location: string;
  catalogMinerId: number;
}): Promise<AssignResult> {
  const res = await api.post<AssignResult>('/admin/miners/broken-machines/assign', opts);
  return res.data;
}

export async function autoAssignAllBroken(): Promise<AssignResult> {
  const res = await api.post<AssignResult>('/admin/miners/broken-machines/assign', { autoAll: true });
  return res.data;
}
