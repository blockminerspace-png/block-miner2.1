import {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Shield, AlertCircle, Pickaxe } from "lucide-react";
import { isAxiosError } from "axios";
import { useVault } from "../../shared/hooks/useVault";
import { useGameStore } from "../../store/game";
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import MachineCard from "../../shared/components/MachineCard";
import MachineQuantityModal from "../../shared/components/MachineQuantityModal";
import { MachinePlacementStatus } from "../../constants/machinePlacement";
import { inventoryStackKey } from "../../shared/utils/inventoryStackKey";
import type { VaultRow, VaultStackGroup } from "../../types/vaultPage";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === "object" && data !== null && "message" in data) {
      const m = (data as { message?: unknown }).message;
      if (typeof m === "string" && m.length > 0) return m;
    }
  }
  return fallback;
}

function isVaultRow(row: unknown): row is VaultRow {
  if (row == null || typeof row !== "object" || !("id" in row)) return false;
  const id = Number((row as { id: unknown }).id);
  return Number.isInteger(id) && id > 0;
}

/** Shared page chrome so loading, error, and content states stay visually consistent. */
function VaultPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 text-white">
      {children}
    </div>
  );
}

export default function Vault() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const vaultItems = useGameStore((s) => s.vaultItems);
  const vaultLoading = useGameStore((s) => s.vaultLoading);
  const vaultError = useGameStore((s) => s.vaultError);
  const fetchVault = useGameStore((s) => s.fetchVault);
  const fetchMachines = useGameStore((s) => s.fetchMachines);
  const fetchInventory = useGameStore((s) => s.fetchInventory);
  const { retrieveFromVault } = useVault();
  const [retrieving, setRetrieving] = useState(false);
  const [vaultQtyModalGroup, setVaultQtyModalGroup] = useState<VaultStackGroup | null>(null);
  const retrieveLock = useRef(false);
  const fetchVaultLock = useRef(false);

  useEffect(() => {
    void fetchVault();
  }, [fetchVault]);

  const vaultRows = useMemo(() => {
    const raw = Array.isArray(vaultItems) ? vaultItems : [];
    return raw.filter(isVaultRow).map((row) => ({
      ...row,
      status: MachinePlacementStatus.VAULT,
    }));
  }, [vaultItems]);

  const groupedVault = useMemo(() => {
    const groups: Record<string, VaultStackGroup> = {};
    for (const row of vaultRows) {
      const key = inventoryStackKey(row);
      if (!groups[key]) {
        groups[key] = { ...row, quantity: 1, items: [row] };
      } else {
        groups[key].quantity += 1;
        groups[key].items.push(row);
      }
    }
    return Object.values(groups).sort(
      (a, b) => Number(b.hashRate ?? 0) - Number(a.hashRate ?? 0)
    );
  }, [vaultRows]);

  const totalVaultUnits = useMemo(
    () => groupedVault.reduce((sum, g) => sum + g.quantity, 0),
    [groupedVault]
  );

  const handleConfirmRetrieveQty = useCallback(
    async (qtyRaw: number) => {
      const group = vaultQtyModalGroup;
      if (!group || retrieveLock.current) return;
      const qty = Math.min(
        Math.max(1, Math.floor(Number(qtyRaw)) || 1),
        group.quantity
      );
      const sorted = [...group.items].sort((a, b) => a.id - b.id);
      const ids = sorted.slice(0, qty).map((r) => r.id).filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length === 0) {
        toast.error(t("common.error"));
        return;
      }
      retrieveLock.current = true;
      setRetrieving(true);
      try {
        await retrieveFromVault({ destination: "inventory", vaultIds: ids });
        toast.success(
          ids.length > 1
            ? t("vault.retrieve_bulk_success", { count: ids.length })
            : t("vault.retrieve_success")
        );
        setVaultQtyModalGroup(null);
        await Promise.all([fetchVault(), fetchMachines(), fetchInventory()]);
      } catch (error) {
        let apiCode: string | undefined;
        if (isAxiosError(error) && error.response?.data && typeof error.response.data === "object") {
          const d = error.response.data as { code?: unknown };
          if (typeof d.code === "string") apiCode = d.code;
        }
        if (apiCode) {
          const key = `vault.errors.${apiCode}`;
          const translated = t(key);
          if (translated !== key) {
            toast.error(translated);
            return;
          }
        }
        toast.error(apiErrorMessage(error, t("vault.retrieve_error")));
      } finally {
        retrieveLock.current = false;
        setRetrieving(false);
      }
    },
    [vaultQtyModalGroup, retrieveFromVault, t, fetchVault, fetchMachines, fetchInventory]
  );

  const navToMiningRoom = useCallback(() => navigate("/inventory"), [navigate]);

  const handleRetryFetch = useCallback(() => {
    if (fetchVaultLock.current) return;
    fetchVaultLock.current = true;
    void (async () => {
      try {
        await fetchVault();
      } finally {
        fetchVaultLock.current = false;
      }
    })();
  }, [fetchVault]);

  const headerNav = (
    <nav className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
      <button
        type="button"
        onClick={navToMiningRoom}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-gray-700/60 bg-gray-800/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-200 transition-colors hover:border-primary/40 hover:bg-gray-800/70 sm:w-auto"
      >
        <Pickaxe className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="text-center leading-snug">{t("vault.nav_back_mining_room")}</span>
      </button>
    </nav>
  );

  if (vaultLoading && vaultRows.length === 0) {
    return (
      <VaultPageShell>
        <header className="flex flex-col gap-4 border-b border-gray-800/40 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Shield className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <h1 className="text-2xl font-black tracking-tight text-white">{t("vault.title")}</h1>
          </div>
          {headerNav}
        </header>
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-gray-800/40 bg-surface p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-sm text-gray-400">{t("vault.loading")}</p>
          </div>
        </div>
      </VaultPageShell>
    );
  }

  if (vaultError && vaultRows.length === 0) {
    return (
      <VaultPageShell>
        <header className="flex flex-col gap-4 border-b border-gray-800/40 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Shield className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <h1 className="text-2xl font-black tracking-tight text-white">{t("vault.title")}</h1>
          </div>
          {headerNav}
        </header>
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-3xl border border-gray-800/40 bg-surface p-8 text-center">
          <AlertCircle className="h-14 w-14 shrink-0 text-amber-500" aria-hidden />
          <p className="max-w-md text-sm text-gray-300">{t("vault.error_loading")}</p>
          <button
            type="button"
            onClick={handleRetryFetch}
            className="min-h-11 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary/90"
          >
            {t("vault.retry")}
          </button>
        </div>
      </VaultPageShell>
    );
  }

  return (
    <VaultPageShell>
      <MachineQuantityModal
        open={Boolean(vaultQtyModalGroup)}
        onClose={() => !retrieving && setVaultQtyModalGroup(null)}
        title={t("vault.quantity_modal_title")}
        subtitle={t("vault.quantity_modal_subtitle")}
        quantityLabel={t("vault.quantity_field")}
        max={vaultQtyModalGroup?.quantity ?? 1}
        min={1}
        confirmLabel={t("vault.quantity_confirm")}
        cancelLabel={t("common.cancel")}
        busy={retrieving}
        onConfirm={(q: number) => void handleConfirmRetrieveQty(q)}
      />

      <header className="flex flex-col gap-4 border-b border-gray-800/40 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Shield className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{t("vault.title")}</h1>
          </div>
          <p className="max-w-2xl text-sm font-medium text-gray-500 sm:text-base">{t("vault.subtitle")}</p>
        </div>
        {headerNav}
      </header>

      {vaultRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-dashed border-gray-800/60 bg-surface px-6 py-16 text-center">
          <Shield className="mx-auto h-16 w-16 text-gray-600" aria-hidden />
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-300">{t("vault.empty")}</h2>
            <p className="mx-auto max-w-md text-sm text-gray-500">{t("vault.empty_hint")}</p>
          </div>
          <button
            type="button"
            onClick={navToMiningRoom}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-wider text-black shadow-glow transition-opacity hover:opacity-90"
          >
            <Pickaxe className="h-4 w-4 shrink-0" aria-hidden />
            {t("vault.empty_cta")}
          </button>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-base font-bold text-gray-300 sm:text-lg">
              {t("vault.stored_machines")} ({totalVaultUnits})
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5">
            {groupedVault.map((group) => (
              <MachineCard
                key={inventoryStackKey(group)}
                machine={group}
                showActions
                isVault
                stackQuantity={group.quantity}
                onRetrieve={() => {
                  if (retrieveLock.current || retrieving) return;
                  setVaultQtyModalGroup(group);
                }}
                retrieveLabel={t("vault.retrieve_from_vault")}
                actionDisabled={retrieving}
              />
            ))}
          </div>
        </>
      )}
      <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="vault-bottom" />
    </VaultPageShell>
  );
}
