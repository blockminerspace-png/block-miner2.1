import { api } from '../../../store/auth';
import type { AdminMinersListResponse, AdminMinersQuery, MinerMutationResponse, UploadImageResponse } from './adminMiners.types';

export async function fetchAdminMiners(params: AdminMinersQuery, signal?: AbortSignal): Promise<AdminMinersListResponse> {
  const response = await api.get<AdminMinersListResponse>('/admin/miners', { params, signal });
  return response.data;
}

export async function createAdminMiner(payload: unknown): Promise<MinerMutationResponse> {
  const response = await api.post<MinerMutationResponse>('/admin/miners', payload);
  return response.data;
}

export async function updateAdminMiner(id: number, payload: unknown): Promise<MinerMutationResponse> {
  const response = await api.patch<MinerMutationResponse>(`/admin/miners/${id}`, payload);
  return response.data;
}

export async function uploadAdminMinerImage(formData: FormData): Promise<UploadImageResponse> {
  const response = await api.post<UploadImageResponse>('/admin/miners/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function duplicateAdminMiner(id: number): Promise<MinerMutationResponse> {
  const response = await api.post<MinerMutationResponse>(`/admin/miners/${id}/duplicate`);
  return response.data;
}

export async function archiveAdminMiner(id: number): Promise<MinerMutationResponse> {
  const response = await api.post<MinerMutationResponse>(`/admin/miners/${id}/archive`);
  return response.data;
}

export async function toggleAdminMinerStore(id: number, showInShop: boolean): Promise<MinerMutationResponse> {
  const response = await api.post<MinerMutationResponse>(`/admin/miners/${id}/toggle-store`, { showInShop });
  return response.data;
}

export async function toggleAdminMinerActive(id: number, isActive: boolean): Promise<MinerMutationResponse> {
  const response = await api.post<MinerMutationResponse>(`/admin/miners/${id}/toggle-active`, { isActive });
  return response.data;
}
