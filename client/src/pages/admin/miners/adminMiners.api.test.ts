import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../../store/auth';
import { fetchAdminMiners, toggleAdminMinerStore } from './adminMiners.api';

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
    expect(data.miners).toEqual([]);
  });

  it('toggleAdminMinerStore posts the server-owned visibility intent', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    await toggleAdminMinerStore(7, false);
    expect(api.post).toHaveBeenCalledWith('/admin/miners/7/toggle-store', { showInShop: false });
  });
});
