import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVault } from '../hooks/useVault';
import { api } from '../store/auth';

// Mock the API
vi.mock('../store/auth', () => ({
  api: {
    post: vi.fn(),
  },
}));

const fetchVault = vi.fn().mockResolvedValue(undefined);
vi.mock('../store/game', () => ({
  useGameStore: {
    getState: () => ({ fetchVault }),
  },
}));

describe('useVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchVault.mockClear();
  });

  describe('moveToVault', () => {
    it('should update machine status to VAULT and call API', async () => {
      const mockMachineId = 42;

      const mockResponse = { data: { ok: true } };
      api.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useVault());

      await act(async () => {
        await result.current.moveToVault(mockMachineId, "inventory");
      });

      expect(api.post).toHaveBeenCalledWith("/vault/move-to-vault", {
        itemId: mockMachineId,
        source: "inventory",
      });
      expect(fetchVault).toHaveBeenCalledTimes(1);
    });

    it('should call API with itemIds for bulk inventory payload', async () => {
      api.post.mockResolvedValue({ data: { ok: true } });
      const { result } = renderHook(() => useVault());
      await act(async () => {
        await result.current.moveToVault({ source: 'inventory', itemIds: [1, 2, 3] });
      });
      expect(api.post).toHaveBeenCalledWith('/vault/move-to-vault', {
        source: 'inventory',
        itemIds: [1, 2, 3],
      });
    });

    it('should throw error if API call fails', async () => {
      const mockMachineId = 99;
      const mockError = new Error('API Error');

      api.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useVault());

      await expect(result.current.moveToVault(mockMachineId)).rejects.toThrow('API Error');
    });
  });

  describe('retrieveFromVault', () => {
    it('should update machine status to INVENTORY and call API', async () => {
      const mockMachineId = 99;

      const mockResponse = { data: { ok: true } };
      api.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useVault());

      await act(async () => {
        await result.current.retrieveFromVault(mockMachineId, 'inventory');
      });

      expect(api.post).toHaveBeenCalledWith('/vault/retrieve-from-vault', {
        vaultId: mockMachineId,
        destination: 'inventory',
      });
      expect(fetchVault).toHaveBeenCalledTimes(1);
    });

    it('should call API with vaultIds for bulk retrieve', async () => {
      api.post.mockResolvedValue({ data: { ok: true } });
      const { result } = renderHook(() => useVault());
      await act(async () => {
        await result.current.retrieveFromVault({ destination: 'inventory', vaultIds: [10, 11] });
      });
      expect(api.post).toHaveBeenCalledWith('/vault/retrieve-from-vault', {
        destination: 'inventory',
        vaultIds: [10, 11],
      });
    });

    it('should throw error if API call fails', async () => {
      const mockMachineId = 99;
      const mockError = new Error('API Error');

      api.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useVault());

      await expect(result.current.retrieveFromVault(mockMachineId)).rejects.toThrow('API Error');
    });
  });
});