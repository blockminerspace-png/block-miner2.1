import { api } from '../../../store/auth';
import type { AdminMinersListResponse, AdminMinersQuery, MinerMutationResponse, UploadImageResponse } from './adminMiners.types';
import { normalizePersistableMinerImageUrl } from './adminMiners.image';

export type AdminMinerSavePayload = Record<string, unknown>;

export type AdminMinerSaveInput = {
  fields: AdminMinerSavePayload;
  imageFile?: File | null;
};

function appendMinerFields(formData: FormData, fields: AdminMinerSavePayload): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (key === 'imageUrl') {
      const url = normalizePersistableMinerImageUrl(typeof value === 'string' ? value : String(value));
      if (url) formData.append(key, url);
      continue;
    }
    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }
}

export function buildAdminMinerFormData(input: AdminMinerSaveInput): FormData {
  const formData = new FormData();
  appendMinerFields(formData, input.fields);
  if (input.imageFile) {
    formData.append('image', input.imageFile);
  }
  return formData;
}

export async function fetchAdminMiners(params: AdminMinersQuery, signal?: AbortSignal): Promise<AdminMinersListResponse> {
  const response = await api.get<AdminMinersListResponse>('/admin/miners', { params, signal });
  return response.data;
}

export async function createAdminMiner(payload: AdminMinerSavePayload, imageFile?: File | null): Promise<MinerMutationResponse> {
  if (imageFile) {
    const response = await api.post<MinerMutationResponse>(
      '/admin/miners',
      buildAdminMinerFormData({ fields: payload, imageFile }),
    );
    return response.data;
  }
  const response = await api.post<MinerMutationResponse>('/admin/miners', payload);
  return response.data;
}

export async function updateAdminMiner(
  id: number,
  payload: AdminMinerSavePayload,
  imageFile?: File | null,
): Promise<MinerMutationResponse> {
  if (imageFile) {
    const response = await api.patch<MinerMutationResponse>(
      `/admin/miners/${id}`,
      buildAdminMinerFormData({ fields: payload, imageFile }),
    );
    return response.data;
  }
  const response = await api.patch<MinerMutationResponse>(`/admin/miners/${id}`, payload);
  return response.data;
}

export async function uploadAdminMinerImage(formData: FormData): Promise<UploadImageResponse> {
  const response = await api.post<UploadImageResponse>('/admin/miners/upload-image', formData);
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
