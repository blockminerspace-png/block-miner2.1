import { useCallback } from "react";
import { isAxiosError } from "axios";
import { api } from "../store/auth";
import { useGameStore } from "../store/game";

type MoveToVaultSource = "inventory" | "rack";

export type MoveToVaultPayload =
  | number
  | {
      source: MoveToVaultSource;
      itemId?: number;
      itemIds?: number[];
      [key: string]: unknown;
    };

export type RetrieveFromVaultPayload =
  | number
  | {
      destination: MoveToVaultSource;
      vaultId?: number;
      vaultIds?: number[];
      slotIndex?: number;
      [key: string]: unknown;
    };

function attachResponseData(err: Error, data: unknown): Error & { response?: { data: unknown } } {
  const e = err as Error & { response?: { data: unknown } };
  e.response = { data };
  return e;
}

/**
 * Vault move/retrieve helpers (critical mutations use server idempotency headers from `api`).
 */
export function useVault() {
  const moveToVault = useCallback(async (arg1: MoveToVaultPayload, source: MoveToVaultSource = "inventory") => {
    try {
      const body =
        typeof arg1 === "object" && arg1 !== null && !Array.isArray(arg1)
          ? arg1
          : { source, itemId: arg1 };

      const response = await api.post("/vault/move-to-vault", body);

      if (!response.data?.ok) {
        const msg =
          typeof response.data?.message === "string"
            ? response.data.message
            : "Failed to move machine to vault";
        throw attachResponseData(new Error(msg), response.data);
      }

      await useGameStore.getState().fetchVault();
      return response.data;
    } catch (error) {
      if (!isAxiosError(error)) {
        console.error("Error moving machine to vault:", error);
      }
      throw error;
    }
  }, []);

  const retrieveFromVault = useCallback(
    async (arg1: RetrieveFromVaultPayload, arg2?: MoveToVaultSource | "inventory" | "rack") => {
      try {
        const body =
          typeof arg1 === "object" && arg1 !== null && !Array.isArray(arg1)
            ? arg1
            : { destination: arg2 ?? "inventory", vaultId: arg1 };

        const response = await api.post("/vault/retrieve-from-vault", body);

        if (!response.data?.ok) {
          const msg =
            typeof response.data?.message === "string"
              ? response.data.message
              : "Failed to retrieve machine from vault";
          throw attachResponseData(new Error(msg), response.data);
        }

        await useGameStore.getState().fetchVault();
        return response.data;
      } catch (error) {
        if (!isAxiosError(error)) {
          console.error("Error retrieving machine from vault:", error);
        }
        throw error;
      }
    },
    []
  );

  return {
    moveToVault,
    retrieveFromVault,
  };
}
