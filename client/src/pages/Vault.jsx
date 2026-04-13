import { useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Shield, AlertCircle } from "lucide-react";
import { useVault } from "../hooks/useVault";
import { useGameStore } from "../store/game";
import MachineCard from "../components/MachineCard";
import { MachinePlacementStatus } from "../constants/machinePlacement";

export default function Vault() {
  const { t } = useTranslation();
  const vaultItems = useGameStore((s) => s.vaultItems);
  const vaultLoading = useGameStore((s) => s.vaultLoading);
  const vaultError = useGameStore((s) => s.vaultError);
  const fetchVault = useGameStore((s) => s.fetchVault);
  const fetchMachines = useGameStore((s) => s.fetchMachines);
  const fetchInventory = useGameStore((s) => s.fetchInventory);
  const { retrieveFromVault } = useVault();

  useEffect(() => {
    void fetchVault();
  }, [fetchVault]);

  const vaultRows = useMemo(
    () =>
      (Array.isArray(vaultItems) ? vaultItems : []).map((row) => ({
        ...row,
        /** Canonical placement for cross-view consistency (vault / warehouse). */
        status: MachinePlacementStatus.VAULT,
      })),
    [vaultItems],
  );

  const handleRetrieveFromVault = useCallback(
    async (vaultRowId) => {
      try {
        await retrieveFromVault(vaultRowId, "inventory");
        toast.success(t("vault.retrieve_success"));
        await Promise.all([fetchVault(), fetchMachines(), fetchInventory()]);
      } catch (error) {
        console.error("Error retrieving machine from vault:", error);
        const apiCode = error?.response?.data?.code;
        if (apiCode) {
          const key = `vault.errors.${apiCode}`;
          const translated = t(key);
          if (translated !== key) {
            toast.error(translated);
            return;
          }
        }
        toast.error(error?.response?.data?.message || t("vault.retrieve_error"));
      }
    },
    [retrieveFromVault, t, fetchVault, fetchMachines, fetchInventory],
  );

  if (vaultLoading && vaultRows.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-400">{t("vault.loading")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (vaultError && vaultRows.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-4">
            <AlertCircle className="h-14 w-14 text-amber-500" aria-hidden />
            <p className="text-gray-300 max-w-md">{t("vault.error_loading")}</p>
            <button
              type="button"
              onClick={() => void fetchVault()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90"
            >
              {t("vault.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold text-white">{t("vault.title")}</h1>
          </div>
          <p className="text-gray-400">{t("vault.subtitle")}</p>
        </div>

        {vaultRows.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="mx-auto h-16 w-16 text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">{t("vault.empty")}</h3>
            <p className="text-gray-500 max-w-md mx-auto">{t("vault.empty_hint")}</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-300 mb-4">
                {t("vault.stored_machines")} ({vaultRows.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {vaultRows.map((machine) => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  showActions={true}
                  onRetrieve={() => handleRetrieveFromVault(machine.id)}
                  retrieveLabel={t("vault.retrieve_from_vault")}
                  isVault={true}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
