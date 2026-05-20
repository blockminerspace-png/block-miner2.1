import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../../store/auth';
import {
  createAdminMiner,
  fetchAdminMiners,
  toggleAdminMinerStore,
  updateAdminMiner,
  uploadAdminMinerImage,
} from './adminMiners.api';

describe('adminMiners.api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchAdminMiners sends pagination, filter and sort params', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true, miners: [], total: 0 } });
    const data = await fetchAdminMiners({ page: 1, limit: 25, filter: 'all', sort: 'recent', q: 'elite' });
    expect(api.get).toHaveBeenCalledWith('/admin/miners', {
      params: { page: 1, limit: 25, filter: 'all', sort: 'recent', q: 'elite' },
      signal: undefined,
    });
    expect(data.ok === false ? [] : data.miners).toEqual([]);
  });

  it('toggleAdminMinerStore posts the server-owned visibility intent', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    await toggleAdminMinerStore(7, false);
    expect(api.post).toHaveBeenCalledWith('/admin/miners/7/toggle-store', { showInShop: false });
  });

  it('updateAdminMiner sends multipart when imageFile is provided', async () => {
    const file = new File(['x'], 'm.png', { type: 'image/png' });
    vi.spyOn(api, 'patch').mockResolvedValue({ data: { ok: true } });
    await updateAdminMiner(3, { name: 'A', imageUrl: '/uploads/miners/old.png' }, file);
    const call = vi.mocked(api.patch).mock.calls[0];
    expect(call?.[0]).toBe('/admin/miners/3');
    expect(call?.[1]).toBeInstanceOf(FormData);
  });

  it('createAdminMiner sends JSON when no imageFile', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    await createAdminMiner({ name: 'A' });
    expect(api.post).toHaveBeenCalledWith('/admin/miners', { name: 'A' });
  });

  it('uploadAdminMinerImage posts FormData without manual Content-Type', async () => {
    const formData = new FormData();
    formData.append('image', new File(['x'], 'm.png', { type: 'image/png' }));
    vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true, url: '/uploads/miners/m.png' } });
    const res = await uploadAdminMinerImage(formData);
    expect(api.post).toHaveBeenCalledWith('/admin/miners/upload-image', formData);
    expect(res.url).toBe('/uploads/miners/m.png');
  });
});
