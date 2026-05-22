import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Package, ArrowRight, Box, Warehouse } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { api } from "../../store/auth";
import { useGameStore } from "../../store/game";
import { getInventory } from "../machines/machines.api";
import { getMachineDisplayImageUrl } from "../machines/machineDisplayImage";
import { MachineImage } from "../machines/components/MachineImage";
import { formatHashrate } from "../../shared/utils/machine";
import { inventoryStackKey } from "../../shared/utils/inventoryStackKey";
import { safeDisplayLabel } from "../../shared/utils/inventoryPageGuards";
import type { BackpackItem, InventoryStackGroup } from "../../types/inventoryPage";
import i18n from "../../i18n/config";

const SOCKET_DEBOUNCE_MS = 160;

function groupInventoryStacks(rows: BackpackItem[]): InventoryStackGroup[] {
  const groups: Record<string, InventoryStackGroup> = {};
  for (const item of rows) {
    const key = inventoryStackKey(item);
    if (!groups[key]) groups[key] = { ...item, quantity: 1, items: [item] };
    else {
      groups[key].quantity += 1;
      groups[key].items.push(item);
    }
  }
  return Object.values(groups).sort(
    (a, b) => Number(b.hashRate || 0) - Number(a.hashRate || 0)
  );
}

export default function InventarioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<BackpackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [vaultBusy, setVaultBusy] = useState(false);
  const initSocket = useGameStore((s) => s.initSocket);
  const socket = useGameStore((s) => s.socket);
  const latestFetchIdRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const fetchData = useCallback(async ({ background = false } = {}) => {
    const requestId = ++latestFetchIdRef.current;
    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    try {
      if (!background) setLoading(true);
      const res = await getInventory(ac.signal);
      if (requestId !== latestFetchIdRef.current) return;
      if (res.data?.ok && Array.isArray(res.data.inventory)) {
        setInventory(
          res.data.inventory.filter(
            (row: unknown): row is BackpackItem =>
              row != null &&
              typeof row === "object" &&
              "id" in row &&
              Number.isInteger(Number((row as { id: unknown }).id)) &&
              Number((row as { id: unknown }).id) > 0
          )
        );
      } else if (!axios.isCancel(ac.signal)) {
        toast.error(i18n.t("inventario.load_error"));
      }
    } catch (e) {
      if (!axios.isCancel(e) && requestId === latestFetchIdRef.current) {
        toast.error(i18n.t("inventario.load_error"));
      }
    } finally {
      if (requestId === latestFetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    initSocket();
    void fetchData();
    return () => {
      fetchAbortRef.current?.abort();
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchData, initSocket]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchData({ background: true });
    }, SOCKET_DEBOUNCE_MS);
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    socket.on("inventory:update", scheduleRefresh);
    return () => {
      socket.off("inventory:update", scheduleRefresh);
    };
  }, [socket, scheduleRefresh]);

  const grouped = useMemo(() => groupInventoryStacks(inventory), [inventory]);

  const handleMoveToVault = useCallback(
    async (itemId: number) => {
      if (!Number.isInteger(itemId) || itemId <= 0) return;
      if (vaultBusy) return;
      setVaultBusy(true);
      try {
        const res = await api.post("/vault/move-to-vault", { source: "inventory", itemId });
        if (res.data.ok) {
          toast.success(t("vault.move_success"));
          await fetchData({ background: true });
        } else {
          toast.error(typeof res.data.message === "string" ? res.data.message : t("vault.move_error"));
        }
      } catch {
        toast.error(t("vault.move_error"));
      } finally {
        setVaultBusy(false);
      }
    },
    [fetchData, t, vaultBusy]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t("inventario.title")}</h1>
          <p className="text-gray-500 font-medium">{t("inventario.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-bold text-primary">
            <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {inventory.length} {t("inventario.items_count")}
          </div>
          <button
            type="button"
            onClick={() => navigate("/inventory")}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-gray-700 bg-gray-800/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-300 transition-colors hover:bg-gray-700"
          >
            {t("inventario.go_to_machines")}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-800 bg-gray-900/30 px-8 py-20 text-center">
          <Box className="mb-4 h-12 w-12 text-gray-700" aria-hidden />
          <p className="text-base font-bold text-gray-500">{t("inventario.empty")}</p>
          <p className="mt-1 text-sm text-gray-600">{t("inventario.empty_hint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {grouped.map((group) => {
            const imageUrl = getMachineDisplayImageUrl({
              imageUrl: group.imageUrl,
              imageSource: group.imageSource,
            });
            const name = safeDisplayLabel(group.minerName);
            const firstId = group.items[0]?.id;
            return (
              <div
                key={inventoryStackKey(group)}
                className="flex flex-col gap-4 rounded-3xl border border-gray-800/50 bg-surface p-5 shadow-xl"
              >
                <div className="flex items-start gap-4">
                  <div className="relative h-16 w-16 shrink-0 rounded-2xl border border-gray-800/50 bg-gray-900/50 p-3">
                    <MachineImage
                      imageUrl={imageUrl}
                      name={name}
                      className="h-full w-full object-contain"
                    />
                    {group.quantity > 1 && (
                      <div className="absolute -right-2 -top-2 rounded-full border border-primary/20 bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
                        x{group.quantity}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-bold leading-snug text-white">{name}</h3>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      <span>{t("inventory.modal.level")} {group.level ?? 1}</span>
                      <span aria-hidden>·</span>
                      <span className="text-primary">{formatHashrate(group.hashRate)}</span>
                      {Number(group.slotSize) >= 2 && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="text-amber-400">{group.slotSize} slots</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-gray-800/40 pt-3">
                  <button
                    type="button"
                    onClick={() => navigate("/inventory")}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                  >
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t("inventario.install_cta")}
                  </button>
                  <button
                    type="button"
                    disabled={vaultBusy || !Number.isFinite(Number(firstId))}
                    onClick={() => firstId != null && void handleMoveToVault(firstId)}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-violet-500/15 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-violet-200 transition-colors hover:bg-violet-500/25 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Warehouse className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t("inventory.backpack_send_warehouse")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
