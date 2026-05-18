import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../store/auth';
import { fetchCheckinStatus } from '../../api/checkinClient';

describe('fetchCheckinStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests GET /checkin/status', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true, checkedIn: false } });
    const data = await fetchCheckinStatus();
    expect(api.get).toHaveBeenCalledWith('/checkin/status');
    expect(data.ok).toBe(true);
  });
});
