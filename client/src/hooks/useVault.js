import { useCallback } from 'react';
import { api } from '../store/auth';
import { useGameStore } from '../store/game';

/**
 * Custom hook for managing vault operations
 * @returns {Object} Vault operations
 */
export function useVault() {
  const moveToVault = useCallback(async (arg1, source = 'inventory') => {
    try {
      const body =
        typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)
          ? arg1
          : { source, itemId: arg1 };

      const response = await api.post('/vault/move-to-vault', body);

      if (!response.data.ok) {
        const err = new Error(response.data.message || 'Failed to move machine to vault');
        err.response = { data: response.data };
        throw err;
      }

      await useGameStore.getState().fetchVault();
      return response.data;
    } catch (error) {
      console.error('Error moving machine to vault:', error);
      throw error;
    }
  }, []);

  const retrieveFromVault = useCallback(async (arg1, arg2) => {
    try {
      const body =
        typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)
          ? arg1
          : { destination: arg2 ?? 'inventory', vaultId: arg1 };

      const response = await api.post('/vault/retrieve-from-vault', body);

      if (!response.data.ok) {
        const err = new Error(response.data.message || 'Failed to retrieve machine from vault');
        err.response = { data: response.data };
        throw err;
      }

      await useGameStore.getState().fetchVault();
      return response.data;
    } catch (error) {
      console.error('Error retrieving machine from vault:', error);
      throw error;
    }
  }, []);

  return {
    moveToVault,
    retrieveFromVault,
  };
}
