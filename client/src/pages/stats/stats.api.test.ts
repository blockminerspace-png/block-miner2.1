import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../store/auth';
import { fetchPowerStatsEnvelope } from './stats.api';

describe('fetchPowerStatsEnvelope', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests GET /stats/power', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true, overview: {} } });
    const data = await fetchPowerStatsEnvelope();
    expect(api.get).toHaveBeenCalledWith('/stats/power');
    expect(data.ok).toBe(true);
  });
});
