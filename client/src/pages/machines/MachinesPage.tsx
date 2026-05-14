import {
  memo,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  useId,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Lock, Plus, Zap, Trash2, Box, AlertCircle, X, Warehouse } from "lucide-react";
import axios, { isAxiosError } from "axios";
import { api } from "../../store/auth";
import { getRooms, getInventory } from "./machines.api";
import { useGameStore } from "../../store/game";
import i18n from "../../i18n/config";
import { formatHashrate, DEFAULT_MINER_IMAGE_URL, getMachineDescriptor } from "../../shared/utils/machine";
import { dedupeOccupiedSlotsForDismantle } from "../../shared/utils/inventoryRackUtils";
import RackMachineTooltipPortal from "../../shared/components/inventory/RackMachineTooltipPortal";
import MachineQuantityModal from "../../shared/components/MachineQuantityModal";
import { inventoryStackKey } from "../../shared/utils/inventoryStackKey";
import type {
  BackpackItem,
  InventoryStackGroup,
  MachineTipState,
  RoomPayload,
  RoomsSummaryState,
  SelectedSlotPayload,
  UserRackSlot,
  VisualRackGroup,
} from "../../types/inventoryPage";
import {
  parsePositiveIntFromDrag,
  safeDisplayLabel,
  sanitizeMachineImageSrc,
} from "../../shared/utils/inventoryPageGuards";

const RACK_TOOLTIP_SHOW_MS = 120;
const RACK_TOOLTIP_HIDE_MS = 80;
const SLOTS_PER_VISUAL_RACK = 8;
const SIDEBAR_GROUP_PAGE_SIZE = 24;
const MODAL_GROUP_PAGE_SIZE = 18;
const SOCKET_REFRESH_DEBOUNCE_MS = 160;

function groupIntoRacks(racks: UserRackSlot[]): VisualRackGroup[] {
  const groups: VisualRackGroup[] = [];
  for (let r = 0; r < Math.ceil(racks.length / SLOTS_PER_VISUAL_RACK); r++) {
    groups.push({
      rackNumber: r + 1,
      slots: racks.slice(r * SLOTS_PER_VISUAL_RACK, (r + 1) * SLOTS_PER_VISUAL_RACK),
    });
  }
  return groups;
}

function canMachineFitVisualSlot(
  slot: UserRackSlot | null | undefined,
  machine: Partial<BackpackItem> & { slotSize?: number }
): boolean {
  if (!slot || !machine) return false;
  const slotSize = Math.max(1, Number(machine.slotSize) || 1);
  if (slotSize <= 1) return true;
  const position = Number(slot.position);
  if (!Number.isInteger(position)) return false;
  return position % 4 <= 4 - slotSize;
}

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

type RackDismantleModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  displayRackNumber: number;
  loading: boolean;
};

/**
 * Accessible confirmation dialog for dismantling every machine in one visual rack.
 * Focus trap, Escape to close (when not loading), and restore focus are handled by the parent via onClose.
 */
function RackDismantleModal({ open, onClose, onConfirm, displayRackNumber, loading }: RackDismantleModalProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const focusClose = () => {
      closeButtonRef.current?.focus();
    };
    const id = requestAnimationFrame(focusClose);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!loading) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusable).filter((el) => el.getClientRects().length > 0);
      if (list.length === 0) return;

      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface border border-gray-800 rounded-[2rem] w-full max-w-[min(100vw-2rem,30rem)] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-6 pb-4 sm:px-8 sm:pt-8 sm:pb-6 flex items-center justify-between border-b border-gray-800/50">
          <div>
            <h3 id={titleId} className="text-xl font-bold text-white">
              {t("inventory.dismantle_rack")}
            </h3>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">
              {t("inventory.rack_heading", { rack: displayRackNumber })}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => !loading && onClose()}
            disabled={loading}
            aria-label={t("common.close")}
            className="w-10 h-10 rounded-xl bg-gray-800/50 text-gray-400 flex items-center justify-center hover:text-white transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>
        <div className="p-4 sm:p-8">
          <div className="space-y-6">
            <p className="text-sm text-gray-400 leading-6">{t("inventory.dismantle_rack_warning")}</p>
            <p className="text-sm font-medium text-gray-300">{t("inventory.dismantle_rack_confirm", { rack: displayRackNumber })}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => onConfirm()}
                className="w-full py-4 rounded-2xl font-bold text-sm transition-all border bg-red-500 text-white border-red-500 hover:bg-red-600 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" aria-hidden />
                ) : (
                  <X className="w-4 h-4 shrink-0" aria-hidden />
                )}
                {loading ? t("inventory.dismantle_rack_loading") : t("inventory.dismantle_rack_confirm_button")}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => onClose()}
                className="w-full py-4 bg-gray-800/80 text-gray-300 rounded-2xl font-bold text-sm transition-all border border-gray-700 hover:bg-gray-700 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

type SlotModalProps = {
  slot: SelectedSlotPayload;
  groupedInventory: InventoryStackGroup[];
  onInstall: (rackId: number, inventoryId: number) => Promise<void>;
  onRemove: (rackId: number) => Promise<void>;
  onMoveToVault: (userMinerId: number) => Promise<void>;
  onClose: () => void;
  actionBusy: boolean;
};

const SlotModal = memo(function SlotModal({
  slot,
  groupedInventory,
  onInstall,
  onRemove,
  onMoveToVault,
  onClose,
  actionBusy,
}: SlotModalProps) {
  const { t } = useTranslation();
  const [confirmingAction, setConfirmingAction] = useState<"inventory" | "vault" | null>(null);
  const [busy, setBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MODAL_GROUP_PAGE_SIZE);
  const machine = slot.miner || null;

  useEffect(() => {
    setConfirmingAction(null);
    setBusy(false);
    setVisibleCount(MODAL_GROUP_PAGE_SIZE);
  }, [slot, groupedInventory]);

  const visibleInventoryGroups = useMemo(
    () => groupedInventory.slice(0, visibleCount),
    [groupedInventory, visibleCount]
  );
  const hasMoreInventoryGroups = visibleCount < groupedInventory.length;
  const descriptor = machine ? getMachineDescriptor(machine) : null;
  const imgSrc = descriptor ? sanitizeMachineImageSrc(descriptor.image) : DEFAULT_MINER_IMAGE_URL;
  const displayNameSafe = machine
    ? safeDisplayLabel(machine.minerName || descriptor?.name || "")
    : "";
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-surface border border-gray-800 rounded-[2rem] w-full max-w-[min(100vw-2rem,30rem)] max-h-[calc(100vh-2rem)] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="px-4 pt-6 pb-4 sm:px-8 sm:pt-8 sm:pb-6 flex items-center justify-between border-b border-gray-800/50">
          <div>
            <h3 className="text-xl font-bold text-white">{machine ? t("inventory.modal.details_title") : t("inventory.modal.install_title")}</h3>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">{t("inventory.modal.rack_slot", { rack: slot.visualRackNumber, slot: slot.slotInRack + 1 })}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy && !actionBusy) onClose();
            }}
            disabled={busy || actionBusy}
            aria-label={t("common.close")}
            className="w-10 h-10 rounded-xl bg-gray-800/50 text-gray-400 flex items-center justify-center hover:text-white transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>
        <div className="p-4 sm:p-8 max-h-[calc(100vh-18rem)] overflow-y-auto">
          {machine ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-2xl border border-gray-800/50 bg-gray-800/20 p-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-gray-800/50 bg-gray-900/50 p-3 sm:mx-0">
                  <img
                    src={imgSrc}
                    alt={safeDisplayLabel(descriptor?.name || "")}
                    className="max-h-full max-w-full object-contain"
                    onError={(e: SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.src = DEFAULT_MINER_IMAGE_URL;
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <h4 className="text-lg font-bold leading-snug text-white break-words">
                    {displayNameSafe || safeDisplayLabel(descriptor?.name || "")}
                  </h4>
                  <div className="mt-2 flex flex-wrap items-start justify-center gap-4 sm:justify-start">
                    <div className="flex flex-col items-center sm:items-start"><span className="text-[10px] font-bold uppercase text-gray-600">{t("inventory.modal.level")}</span><span className="text-sm font-bold text-gray-300">{machine.level}</span></div>
                    <div className="flex flex-col items-center sm:items-start"><span className="text-[10px] font-bold uppercase text-gray-600">{t("inventory.modal.hashrate")}</span><span className="text-sm font-bold uppercase text-primary">{formatHashrate(machine.hashRate)}</span></div>
                    {Number(machine.slotSize) >= 2 && (
                      <div className="flex flex-col items-center sm:items-start">
                        <span className="text-[10px] font-bold uppercase text-gray-600">{t("inventory.modal.slots")}</span>
                        <span className="text-sm font-bold text-amber-400">{machine.slotSize}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-400 leading-relaxed">{t("inventory.modal.remove_options_intro")}</p>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={busy || actionBusy}
                      onClick={async () => {
                        if (busy || actionBusy) return;
                        if (confirmingAction === "inventory") {
                          const rackIdForRemove = slot.rack?.id;
                          if (
                            rackIdForRemove == null ||
                            !Number.isInteger(rackIdForRemove) ||
                            rackIdForRemove <= 0
                          ) {
                            toast.error(t("common.error"));
                            return;
                          }
                          setBusy(true);
                          try {
                            await onRemove(rackIdForRemove);
                          } finally {
                            setBusy(false);
                          }
                          return;
                        }
                        setConfirmingAction("inventory");
                      }}
                      className={`group flex min-h-11 w-full flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-center text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 sm:flex-row sm:text-left ${
                        confirmingAction === "inventory"
                          ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20"
                          : "bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/15 hover:border-red-500/50"
                      }`}
                    >
                      <Trash2 className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
                      <span className="leading-snug whitespace-normal">
                        {confirmingAction === "inventory"
                          ? t("inventory.modal.confirm_remove_button")
                          : t("inventory.modal.remove_to_inventory")}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || actionBusy || !Number.isFinite(Number(machine.id))}
                      onClick={async () => {
                        if (busy || actionBusy) return;
                        if (confirmingAction === "vault") {
                          const mid = Number(machine.id);
                          if (!Number.isInteger(mid) || mid <= 0) {
                            toast.error(t("common.error"));
                            return;
                          }
                          setBusy(true);
                          try {
                            await onMoveToVault(mid);
                          } finally {
                            setBusy(false);
                          }
                          return;
                        }
                        setConfirmingAction("vault");
                      }}
                      className={`group flex min-h-11 w-full flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-center text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 sm:flex-row sm:text-left ${
                        confirmingAction === "vault"
                          ? "bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-600/25"
                          : "bg-violet-500/15 text-violet-200 border-violet-500/35 hover:bg-violet-500/25 hover:border-violet-400/50"
                      }`}
                    >
                      <Warehouse className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
                      <span className="leading-snug whitespace-normal">
                        {confirmingAction === "vault"
                          ? t("inventory.modal.confirm_move_warehouse")
                          : t("inventory.modal.move_to_warehouse")}
                      </span>
                    </button>
                  </div>
                  {confirmingAction != null && (
                    <button
                      type="button"
                      disabled={busy || actionBusy}
                      onClick={() => setConfirmingAction(null)}
                      className="min-h-11 w-full rounded-2xl border border-gray-800 bg-gray-900/90 py-3 text-sm font-semibold text-gray-400 transition-all hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
                    >
                      {t("common.cancel")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedInventory.length === 0 ? (
                <div className="p-8 text-center bg-gray-800/20 rounded-2xl border border-dashed border-gray-800"><p className="text-gray-500 text-sm">{t("inventory.modal.no_machines_avail")}</p></div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {visibleInventoryGroups.map((group) => {
                    const desc = getMachineDescriptor({
                      hashRate: group.hashRate,
                      slotSize: group.slotSize,
                      imageUrl: group.imageUrl,
                    });
                    const rowImg = sanitizeMachineImageSrc(desc.image);
                    const rowAlt = safeDisplayLabel(group.minerName);
                    return (
                      <button
                        key={inventoryStackKey(group)}
                        type="button"
                        disabled={busy || actionBusy}
                        onClick={async () => {
                          if (busy || actionBusy) return;
                          if (!canMachineFitVisualSlot(slot.rack, group)) {
                            toast.error(t("inventory.double_slot_row_edge"));
                            return;
                          }
                          const first = group.items[0];
                          const rackIdForInstall = slot.rack?.id;
                          if (
                            rackIdForInstall == null ||
                            !Number.isInteger(rackIdForInstall) ||
                            rackIdForInstall <= 0 ||
                            !first ||
                            !Number.isInteger(first.id) ||
                            first.id <= 0
                          ) {
                            toast.error(t("common.error"));
                            return;
                          }
                          setBusy(true);
                          try {
                            await onInstall(rackIdForInstall, first.id);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-800/30 p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <div className="flex items-center gap-3 text-left">
                          <div className="w-10 h-10 bg-gray-900 rounded-lg p-2 shrink-0 relative">
                            <img
                              src={rowImg}
                              alt={rowAlt}
                              className="w-full h-full object-contain"
                              onError={(e: SyntheticEvent<HTMLImageElement>) => {
                                e.currentTarget.src = DEFAULT_MINER_IMAGE_URL;
                              }}
                            />
                            <div className="absolute -top-2 -right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-primary/20">x{group.quantity}</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{rowAlt}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">{formatHashrate(group.hashRate)}</div>
                          </div>
                        </div>
                        <Plus className="w-5 h-5 text-gray-600" />
                      </button>
                    );
                  })}
                  {hasMoreInventoryGroups && (
                    <button
                      type="button"
                      disabled={busy || actionBusy}
                      onClick={() => setVisibleCount((current) => current + MODAL_GROUP_PAGE_SIZE)}
                      className="min-h-11 w-full rounded-2xl border border-gray-800/70 bg-gray-900/70 px-4 py-3 text-sm font-bold text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-800 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {t("common.load_more", { defaultValue: "Carregar mais" })}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

type RackCardProps = {
  rackNumber: number;
  slots: UserRackSlot[];
  onSlotClick: (slot: SelectedSlotPayload) => void;
  onSlotDrop: (rackId: number, inventoryId: number) => void | Promise<void>;
  onDismantleRack: (slots: UserRackSlot[]) => Promise<void>;
  rackDismantleLoading: boolean;
  rackActionBusy: boolean;
};

const RackCard = memo(function RackCard({
  rackNumber,
  slots,
  onSlotClick,
  onSlotDrop,
  onDismantleRack,
  rackDismantleLoading,
  rackActionBusy,
}: RackCardProps) {
  const { t } = useTranslation();
  const [dragOverId, setDragOverId] = useState<number | string | null>(null);
  const [confirmingDismantle, setConfirmingDismantle] = useState(false);
  const [machineTip, setMachineTip] = useState<MachineTipState | null>(null);
  const [hoverFinePointer, setHoverFinePointer] = useState(false);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setHoverFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const cancelScheduledHide = useCallback(() => {
    clearHideTimer();
  }, [clearHideTimer]);

  const scheduleHideTip = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setMachineTip(null);
    }, RACK_TOOLTIP_HIDE_MS);
  }, [clearHideTimer]);

  const showMachineTipNow = useCallback(
    (anchorEl: HTMLElement, payload: Omit<MachineTipState, "anchorEl">) => {
      clearShowTimer();
      cancelScheduledHide();
      setMachineTip({ anchorEl, ...payload });
    },
    [clearShowTimer, cancelScheduledHide]
  );

  const scheduleShowMachineTip = useCallback(
    (anchorEl: HTMLElement, payload: Omit<MachineTipState, "anchorEl">) => {
      clearShowTimer();
      cancelScheduledHide();
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        setMachineTip({ anchorEl, ...payload });
      }, RACK_TOOLTIP_SHOW_MS);
    },
    [clearShowTimer, cancelScheduledHide]
  );

  useEffect(
    () => () => {
      clearShowTimer();
      clearHideTimer();
    },
    [clearShowTimer, clearHideTimer]
  );

  const hasMachines = slots.some((s) => s?.miner);

  return (
    <div className="bg-surface border border-gray-800/50 rounded-3xl overflow-hidden shadow-xl">
      <div className="px-3 py-2.5 sm:px-6 sm:py-4 bg-gray-800/20 border-b border-gray-800/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow shrink-0" />
          <h3 className="text-sm font-bold text-gray-300 truncate">
            {t("inventory.rack_heading", { rack: rackNumber })}
          </h3>
        </div>
        {hasMachines && (
          <button
            type="button"
            onClick={() => setConfirmingDismantle(true)}
            disabled={rackDismantleLoading || rackActionBusy}
            title={t("inventory.dismantle_rack_tooltip")}
            aria-label={t("inventory.dismantle_rack_aria")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="w-4 h-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-2 sm:gap-3 sm:p-4">
        {(() => {
          const rendered = [];
          let i = 0;
          while (i < slots.length) {
            const rack = slots[i];
            const machine = rack ? rack.miner : null;
            const descriptor = machine ? getMachineDescriptor(machine) : null;
            const isOccupied = !!machine;
            const isBlocked = !machine && !!rack?.blockedByMinerId;
            const isDoubleSlot =
              isOccupied && machine != null && Number(machine.slotSize) >= 2;
            const slotKey = rack?.id ?? i;
            const isDragTarget = dragOverId === slotKey;

            // Skip cells blocked by a two-slot miner (rendered as col-span-2 on the primary cell)
            if (isBlocked) {
              i++;
              continue;
            }

            const displayName = machine
              ? safeDisplayLabel(machine.minerName || descriptor?.name || "")
              : "";
            const hashrateStr = machine ? formatHashrate(machine.hashRate) : "";
            const slotSizeNum = machine ? Math.max(1, Number(machine.slotSize) || 1) : 1;
            const stableSlotKey = rack?.id ?? i;
            const occupiedAria = machine
              ? t("inventory.rack_slot_machine_aria", {
                  name: displayName,
                  power: hashrateStr,
                  slots: slotSizeNum,
                })
              : t("inventory.slot_empty_tooltip");

            const machineTipPayload: Omit<MachineTipState, "anchorEl"> = {
              slotKey: stableSlotKey,
              displayName,
              hashrateStr,
              slotSize: slotSizeNum,
            };

            rendered.push(
              <button
                key={rack ? rack.id : i}
                type="button"
                disabled={rackActionBusy || rackDismantleLoading}
                aria-label={occupiedAria}
                onClick={() => onSlotClick({ rack, miner: machine, visualRackNumber: rackNumber, slotInRack: i })}
                style={isDoubleSlot ? { gridColumn: 'span 2' } : {}}
                onDragOver={!isOccupied && !rackActionBusy ? (e) => { e.preventDefault(); setDragOverId(slotKey); } : undefined}
                onDragLeave={!isOccupied && !rackActionBusy ? () => setDragOverId(null) : undefined}
                onDrop={
                  !isOccupied && !rackActionBusy
                    ? (e) => {
                        e.preventDefault();
                        setDragOverId(null);
                        const invId = parsePositiveIntFromDrag(e.dataTransfer.getData("inventoryId"));
                        const rid = rack?.id;
                        if (invId != null && Number.isInteger(rid) && rid > 0) onSlotDrop(rid, invId);
                      }
                    : undefined
                }
                onMouseEnter={
                  isOccupied && hoverFinePointer
                    ? (e) => {
                        cancelScheduledHide();
                        clearShowTimer();
                        const anchor = e.currentTarget;
                        if (machineTip) {
                          showMachineTipNow(anchor, machineTipPayload);
                        } else {
                          scheduleShowMachineTip(anchor, machineTipPayload);
                        }
                      }
                    : undefined
                }
                onMouseLeave={isOccupied && hoverFinePointer ? () => scheduleHideTip() : undefined}
                onFocus={
                  isOccupied
                    ? (e) => {
                        clearShowTimer();
                        cancelScheduledHide();
                        showMachineTipNow(e.currentTarget, machineTipPayload);
                      }
                    : undefined
                }
                onBlur={
                  isOccupied
                    ? () => {
                        clearShowTimer();
                        clearHideTimer();
                        setMachineTip(null);
                      }
                    : undefined
                }
                className={`group relative flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border p-1 text-center transition-all duration-200 sm:rounded-2xl sm:p-1.5 ${
                  isOccupied
                    ? "border-primary/30 bg-primary/5"
                    : isDragTarget
                    ? "scale-[1.02] border-primary bg-primary/15 shadow-glow sm:scale-[1.04]"
                    : "border-gray-800/50 bg-gray-900/30 hover:border-gray-700"
                } ${isDoubleSlot ? "aspect-[2/1]" : "aspect-square"}`}
              >
                {isOccupied && descriptor ? (
                  <>
                    <div className="pointer-events-none flex min-h-0 w-full flex-1 items-center justify-center p-0.5 sm:p-2">
                      <img
                        src={sanitizeMachineImageSrc(descriptor.image)}
                        alt=""
                        className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                        onError={(e: SyntheticEvent<HTMLImageElement>) => {
                          e.currentTarget.src = DEFAULT_MINER_IMAGE_URL;
                        }}
                      />
                    </div>
                    <div className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary sm:right-1.5 sm:top-1.5" />
                    {isDoubleSlot && (
                      <div className="pointer-events-none absolute bottom-1 left-1 rounded bg-amber-500/90 px-1 text-[7px] font-black leading-tight text-black">2×</div>
                    )}
                  </>
                ) : isDragTarget ? (
                  <div className="flex flex-col items-center justify-center gap-0.5 px-0.5">
                    <Plus className="h-6 w-6 shrink-0 animate-pulse text-primary" aria-hidden />
                    <span className="hidden text-[8px] font-bold uppercase leading-tight text-primary/90 md:inline">{t("inventory.slot_add_machine")}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 px-0.5">
                    <Plus className="h-5 w-5 shrink-0 text-gray-600 transition-colors group-hover:text-gray-400" aria-hidden />
                    <span className="hidden max-w-[5.5rem] text-[8px] font-bold uppercase leading-tight tracking-wide text-gray-500 group-hover:text-gray-400 md:inline md:max-w-none md:text-[9px]">
                      {t("inventory.slot_add_machine")}
                    </span>
                  </div>
                )}
              </button>
            );
            i++;
          }
          return rendered;
        })()}
      </div>
      <RackMachineTooltipPortal
        open={Boolean(machineTip)}
        anchorEl={machineTip?.anchorEl ?? null}
        displayName={machineTip?.displayName ?? ""}
        hashrateStr={machineTip?.hashrateStr ?? ""}
        slotSize={machineTip?.slotSize ?? 1}
      />
      <RackDismantleModal
        open={confirmingDismantle}
        onClose={() => !rackDismantleLoading && setConfirmingDismantle(false)}
        displayRackNumber={rackNumber}
        loading={rackDismantleLoading}
        onConfirm={async () => {
          try {
            await onDismantleRack(slots);
            setConfirmingDismantle(false);
          } catch {
            /* Errors and toasts are handled in the parent handler */
          }
        }}
      />
    </div>
  );
});

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

export default function Inventory() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<RoomPayload[]>([]);
  const [inventory, setInventory] = useState<BackpackItem[]>([]);
  const [summary, setSummary] = useState<RoomsSummaryState>({
    totalRacks: 0,
    occupiedRacks: 0,
    freeRacks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [buyingRoom, setBuyingRoom] = useState(false);
  const [rackDismantleLoading, setRackDismantleLoading] = useState(false);
  const [rackActionBusy, setRackActionBusy] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlotPayload | null>(null);
  const [activeRoom, setActiveRoom] = useState(1);
  const [visibleInventoryGroupsCount, setVisibleInventoryGroupsCount] = useState(SIDEBAR_GROUP_PAGE_SIZE);
  /** Grouped backpack stack open in the “send to warehouse” quantity modal. */
  const [backpackWarehouseModal, setBackpackWarehouseModal] = useState<InventoryStackGroup | null>(null);
  const [backpackVaultBusy, setBackpackVaultBusy] = useState(false);
  const navigate = useNavigate();
  const initSocket = useGameStore((s) => s.initSocket);
  const socket = useGameStore((s) => s.socket);
  const latestFetchIdRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const rackMutationLock = useRef(false);
  const buyRoomLock = useRef(false);
  const backpackVaultLock = useRef(false);
  const dismantleLock = useRef(false);

  const fetchData = useCallback(async ({ background = false } = {}) => {
    const requestId = ++latestFetchIdRef.current;
    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    try {
      if (!background) setLoading(true);
      const signal = ac.signal;
      const [roomsOutcome, invOutcome] = await Promise.allSettled([
        getRooms(signal),
        getInventory(signal),
      ]);
      if (requestId !== latestFetchIdRef.current) return;

      if (roomsOutcome.status === "fulfilled") {
        const roomsRes = roomsOutcome.value;
        if (roomsRes.data?.ok && Array.isArray(roomsRes.data.rooms)) {
          setRooms(roomsRes.data.rooms as RoomPayload[]);
          setSummary({
            totalRacks: Number(roomsRes.data.totalRacks) || 0,
            occupiedRacks: Number(roomsRes.data.occupiedRacks) || 0,
            freeRacks: Number(roomsRes.data.freeRacks) || 0,
          });
        }
      } else if (!axios.isCancel(roomsOutcome.reason)) {
        console.error("inventory: rooms fetch failed", roomsOutcome.reason);
      }

      if (invOutcome.status === "fulfilled") {
        const invRes = invOutcome.value;
        if (invRes.data?.ok && Array.isArray(invRes.data.inventory)) {
          const rows = invRes.data.inventory.filter(
            (row: unknown): row is BackpackItem =>
              row != null &&
              typeof row === "object" &&
              "id" in row &&
              Number.isInteger(Number((row as { id: unknown }).id)) &&
              Number((row as { id: unknown }).id) > 0
          );
          setInventory(rows);
        }
      } else if (!axios.isCancel(invOutcome.reason)) {
        console.error("inventory: backpack fetch failed", invOutcome.reason);
      }

      const roomsRejectedCancel =
        roomsOutcome.status === "rejected" && axios.isCancel(roomsOutcome.reason);
      const invRejectedCancel = invOutcome.status === "rejected" && axios.isCancel(invOutcome.reason);
      const roomsBad =
        roomsOutcome.status === "rejected"
          ? !roomsRejectedCancel
          : !roomsOutcome.value?.data?.ok;
      const invBad =
        invOutcome.status === "rejected" ? !invRejectedCancel : !invOutcome.value?.data?.ok;
      if (requestId === latestFetchIdRef.current && (roomsBad || invBad)) {
        toast.error(i18n.t("inventory.load_error"));
      }
    } catch (e) {
      if (!axios.isCancel(e) && requestId === latestFetchIdRef.current) {
        toast.error(i18n.t("inventory.load_error"));
      }
    } finally {
      if (requestId === latestFetchIdRef.current) {
        setLoading(false);
      }
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

  const scheduleBackgroundRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchData({ background: true });
    }, SOCKET_REFRESH_DEBOUNCE_MS);
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    socket.on("inventory:update", scheduleBackgroundRefresh);
    socket.on("machines:update", scheduleBackgroundRefresh);
    socket.on("vault:update", scheduleBackgroundRefresh);
    return () => {
      socket.off("inventory:update", scheduleBackgroundRefresh);
      socket.off("machines:update", scheduleBackgroundRefresh);
      socket.off("vault:update", scheduleBackgroundRefresh);
    };
  }, [socket, scheduleBackgroundRefresh]);

  const handleBuyRoom = useCallback(
    async (roomNumber: number) => {
      if (!Number.isInteger(roomNumber) || roomNumber < 1) {
        toast.error(t("common.error"));
        return;
      }
      if (buyRoomLock.current) return;
      buyRoomLock.current = true;
      setBuyingRoom(true);
      try {
        const res = await api.post("/rooms/buy");
        if (res.data.ok) {
          toast.success(t("inventory.room_unlocked", { room: roomNumber }));
          setActiveRoom(roomNumber);
          await fetchData({ background: true });
        } else {
          toast.error(
            typeof res.data.message === "string" ? res.data.message : t("common.error")
          );
        }
      } catch (err) {
        toast.error(apiErrorMessage(err, t("common.error")));
      } finally {
        buyRoomLock.current = false;
        setBuyingRoom(false);
      }
    },
    [fetchData, t]
  );

  const handleInstall = useCallback(
    async (rackId: number, inventoryId: number) => {
      if (!Number.isInteger(rackId) || rackId <= 0 || !Number.isInteger(inventoryId) || inventoryId <= 0) {
        toast.error(t("common.error"));
        return;
      }
      if (rackMutationLock.current) return;
      const targetRack = rooms
        .flatMap((room) => ("racks" in room ? room.racks || [] : []))
        .find((rack) => rack.id === rackId);
      const inventoryItem = inventory.find((item) => item.id === inventoryId);
      if (inventoryItem && !canMachineFitVisualSlot(targetRack, inventoryItem)) {
        toast.error(t("inventory.double_slot_row_edge"));
        return;
      }
      rackMutationLock.current = true;
      setRackActionBusy(true);
      try {
        const res = await api.post("/rooms/rack/install", { rackId, inventoryId });
        if (res.data.ok) {
          toast.success(t("inventory.install_success"));
          setSelectedSlot(null);
          await fetchData({ background: true });
        } else {
          toast.error(
            typeof res.data.message === "string" ? res.data.message : t("common.error")
          );
        }
      } catch (err) {
        toast.error(apiErrorMessage(err, t("common.error")));
      } finally {
        rackMutationLock.current = false;
        setRackActionBusy(false);
      }
    },
    [fetchData, inventory, rooms, t]
  );

  const handleRemove = useCallback(
    async (rackId: number) => {
      if (!Number.isInteger(rackId) || rackId <= 0) {
        toast.error(t("common.error"));
        return;
      }
      if (rackMutationLock.current) return;
      rackMutationLock.current = true;
      setRackActionBusy(true);
      try {
        const res = await api.post("/rooms/rack/uninstall", { rackId });
        if (res.data.ok) {
          toast.success(t("inventory.remove_success"));
          setSelectedSlot(null);
          await fetchData({ background: true });
        } else {
          toast.error(
            typeof res.data.message === "string" ? res.data.message : t("common.error")
          );
        }
      } catch (err) {
        toast.error(apiErrorMessage(err, t("common.error")));
      } finally {
        rackMutationLock.current = false;
        setRackActionBusy(false);
      }
    },
    [fetchData, t]
  );

  const handleMoveInventoryToVault = useCallback(
    async (inventoryItemIds: number[] | number) => {
      const ids = (Array.isArray(inventoryItemIds) ? inventoryItemIds : [inventoryItemIds])
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length === 0) {
        toast.error(t("common.error"));
        return;
      }
      if (backpackVaultLock.current) return;
      backpackVaultLock.current = true;
      setBackpackVaultBusy(true);
      try {
        const body =
          ids.length === 1
            ? { source: "inventory" as const, itemId: ids[0]! }
            : { source: "inventory" as const, itemIds: ids };
        const res = await api.post("/vault/move-to-vault", body);
        if (res.data.ok) {
          toast.success(
            ids.length > 1
              ? t("inventory.backpack_bulk_success", { count: ids.length })
              : t("vault.move_success")
          );
          setBackpackWarehouseModal(null);
          await fetchData({ background: true });
        } else {
          toast.error(
            typeof res.data.message === "string" ? res.data.message : t("vault.move_error")
          );
        }
      } catch (err) {
        let apiCode: string | undefined;
        if (isAxiosError(err) && err.response?.data && typeof err.response.data === "object") {
          const d = err.response.data as { code?: unknown };
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
        toast.error(apiErrorMessage(err, t("vault.move_error")));
      } finally {
        backpackVaultLock.current = false;
        setBackpackVaultBusy(false);
      }
    },
    [fetchData, t]
  );

  const handleMoveRackToVault = useCallback(
    async (userMinerId: number) => {
      const id = Number(userMinerId);
      if (!Number.isInteger(id) || id <= 0) {
        toast.error(t("common.error"));
        return;
      }
      if (rackMutationLock.current) return;
      rackMutationLock.current = true;
      setRackActionBusy(true);
      try {
        const res = await api.post("/vault/move-to-vault", { source: "rack" as const, itemId: id });
        if (res.data.ok) {
          toast.success(t("vault.move_success"));
          setSelectedSlot(null);
          await fetchData({ background: true });
        } else {
          toast.error(
            typeof res.data.message === "string" ? res.data.message : t("vault.move_error")
          );
        }
      } catch (err) {
        let apiCode: string | undefined;
        if (isAxiosError(err) && err.response?.data && typeof err.response.data === "object") {
          const d = err.response.data as { code?: unknown };
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
        if (isAxiosError(err) && err.response?.status === 409) {
          toast.error(t("vault.move_conflict"));
        } else {
          toast.error(apiErrorMessage(err, t("vault.move_error")));
        }
      } finally {
        rackMutationLock.current = false;
        setRackActionBusy(false);
      }
    },
    [fetchData, t]
  );

  /**
   * Uninstalls every occupied slot in one visual rack (same API as single-slot removal).
   */
  const handleRemoveRackSlots = useCallback(
    async (rackSlots: UserRackSlot[]) => {
      const occupied = dedupeOccupiedSlotsForDismantle(rackSlots || []);
      if (occupied.length === 0) return;
      if (dismantleLock.current) return;
      dismantleLock.current = true;
      setRackDismantleLoading(true);
      setRackActionBusy(true);
      try {
        const res = await api.post("/rooms/rack/uninstall-batch", {
          rackIds: occupied.map((s) => s.id),
        });
        if (!res.data?.ok) {
          toast.error(
            res.data && typeof res.data === "object" && "message" in res.data
              ? String((res.data as { message?: string }).message || t("common.error"))
              : t("common.error")
          );
          await fetchData({ background: true });
          throw new Error("UNINSTALL_FAILED");
        }
        toast.success(t("inventory.dismantle_rack_success"));
        await fetchData({ background: true });
      } catch (err) {
        if (err instanceof Error && err.message !== "UNINSTALL_FAILED") {
          toast.error(apiErrorMessage(err, t("common.error")));
          await fetchData({ background: true });
        }
        throw err;
      } finally {
        dismantleLock.current = false;
        setRackDismantleLoading(false);
        setRackActionBusy(false);
      }
    },
    [t, fetchData]
  );

  const groupedInventory = useMemo(() => groupInventoryStacks(inventory), [inventory]);
  const visibleInventoryGroups = useMemo(
    () => groupedInventory.slice(0, visibleInventoryGroupsCount),
    [groupedInventory, visibleInventoryGroupsCount]
  );
  const hasMoreInventoryGroups = visibleInventoryGroupsCount < groupedInventory.length;

  useEffect(() => {
    setVisibleInventoryGroupsCount(SIDEBAR_GROUP_PAGE_SIZE);
  }, [groupedInventory.length]);

  const activeMachinesHashRate = useMemo(
    () =>
      rooms
        .flatMap((r) => (r.unlocked && "racks" in r ? r.racks : []))
        .filter((rack) => rack.miner)
        .reduce((sum, rack) => sum + Number(rack.miner?.hashRate || 0), 0),
    [rooms]
  );

  const currentRoom = useMemo(
    () => rooms.find((room) => room.roomNumber === activeRoom) ?? null,
    [rooms, activeRoom]
  );
  const visualRacksOfCurrent = useMemo(() => {
    if (!currentRoom?.unlocked) return [];
    return groupIntoRacks(currentRoom.racks);
  }, [currentRoom]);
  const rackOffset = currentRoom
    ? (currentRoom.roomNumber - 1) * (visualRacksOfCurrent.length || 24)
    : 0;
  const handleSelectSlot = useCallback((slot: SelectedSlotPayload) => {
    setBackpackWarehouseModal(null);
    setSelectedSlot(slot);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <MachineQuantityModal
        open={Boolean(backpackWarehouseModal)}
        onClose={() => !backpackVaultBusy && setBackpackWarehouseModal(null)}
        title={t("inventory.backpack_qty_modal_title")}
        subtitle={t("inventory.backpack_qty_modal_subtitle")}
        quantityLabel={t("inventory.backpack_qty_field")}
        max={backpackWarehouseModal?.quantity ?? 1}
        min={1}
        confirmLabel={t("inventory.backpack_qty_confirm")}
        cancelLabel={t("common.cancel")}
        busy={backpackVaultBusy}
        onConfirm={(q: number) => {
          const group = backpackWarehouseModal;
          if (!group) return;
          const qty = Math.min(Math.max(1, Math.floor(Number(q)) || 1), group.quantity);
          const sorted = [...group.items].sort((a, b) => a.id - b.id);
          void handleMoveInventoryToVault(sorted.slice(0, qty).map((r) => r.id));
        }}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-black text-white tracking-tight">{t("inventory.title")}</h1>
          <p className="text-gray-500 font-medium">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-end">
          <button
            type="button"
            onClick={() => navigate("/vault")}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-secondary/25 bg-secondary/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-secondary transition-colors hover:bg-secondary/20 sm:w-auto"
          >
            <Warehouse className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            {t("inventory.go_to_warehouse")}
          </button>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <div className="inline-flex min-h-11 flex-1 min-w-[10rem] items-center justify-center gap-1.5 rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-xs font-bold text-purple-400 shadow-glow-sm sm:flex-initial">
              <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {formatHashrate(activeMachinesHashRate)}
            </div>
            <div className="inline-flex min-h-11 flex-1 min-w-[8rem] items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/50 px-4 py-2 text-xs font-bold text-gray-400 sm:flex-initial">
              {summary.occupiedRacks} {t("inventory.active_machines")}
            </div>
            <div className="inline-flex min-h-11 flex-1 min-w-[8rem] items-center justify-center rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-bold text-primary sm:flex-initial">
              {inventory.length} {t("inventory.in_inventory")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="tablist">
        {rooms.map((room) => {
          const isActive = room.roomNumber === activeRoom;
          const isUnlocked = room.unlocked;
          return (
            <button key={room.roomNumber} role="tab" aria-selected={isActive} onClick={() => setActiveRoom(room.roomNumber)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${isActive ? "bg-primary text-black shadow-glow" : isUnlocked ? "bg-gray-800/50 text-gray-300 hover:bg-gray-700/50" : "bg-gray-900/30 text-gray-500 hover:text-gray-400"}`}>
              {!isUnlocked && <Lock className="w-3 h-3" />}
              {t("inventory.room_label")} {room.roomNumber}
              {isUnlocked && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 items-start">
        <div className="lg:col-span-2" role="tabpanel">
          {currentRoom ? (
            currentRoom.unlocked ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {visualRacksOfCurrent.map((vr) => (
                  <RackCard
                    key={vr.rackNumber}
                    rackNumber={rackOffset + vr.rackNumber}
                    slots={vr.slots}
                    onSlotClick={handleSelectSlot}
                    onSlotDrop={handleInstall}
                    onDismantleRack={handleRemoveRackSlots}
                    rackDismantleLoading={rackDismantleLoading}
                    rackActionBusy={rackActionBusy}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-surface border border-gray-800/30 rounded-3xl p-6 sm:p-10 flex flex-col items-center justify-center gap-6 text-center min-h-64">
                <div className="w-16 h-16 rounded-2xl bg-gray-800/40 border border-gray-800/50 flex items-center justify-center">
                  <Lock className="w-7 h-7 text-gray-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-gray-400">{t("inventory.room_locked", { room: currentRoom.roomNumber })}</p>
                  <p className="text-xs text-gray-600 mt-1">{t("inventory.room_locked_desc")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleBuyRoom(currentRoom.roomNumber)}
                  disabled={buyingRoom}
                  className="px-8 py-3 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/80 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {buyingRoom
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><Zap className="w-3.5 h-3.5" />{currentRoom.price === 0 ? t("inventory.unlock_free") : t("inventory.buy_room", { price: currentRoom.price })}</>
                  }
                </button>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center min-h-64">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="space-y-4">
            <div className="bg-surface border border-gray-800/50 rounded-3xl p-4 sm:p-6 shadow-xl lg:sticky top-28">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Box className="h-5 w-5 shrink-0 text-primary" aria-hidden /> {t("sidebar.machines")}
              </h2>
              <button
                type="button"
                onClick={() => navigate("/vault")}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-secondary/25 bg-secondary/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-secondary transition-colors hover:bg-secondary/20 sm:w-auto sm:px-4 sm:text-xs"
              >
                <Warehouse className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                {t("inventory.go_to_warehouse")}
              </button>
            </div>
            {inventory.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-gray-800/20 rounded-2xl border border-dashed border-gray-800">
                <AlertCircle className="w-10 h-10 text-gray-700 mb-3" />
                <p className="text-gray-500 text-sm font-medium">{t("inventory.empty_inventory")}</p>
                <p className="text-gray-600 text-xs mt-1">{t("inventory.buy_miners_msg")}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
                {visibleInventoryGroups.map((group) => {
                  const descriptor = getMachineDescriptor({
                    hashRate: group.hashRate,
                    slotSize: group.slotSize,
                    imageUrl: group.imageUrl,
                  });
                  const sideImg = sanitizeMachineImageSrc(descriptor.image);
                  const sideName = safeDisplayLabel(group.minerName);
                  const firstId = group.items[0]?.id;
                  return (
                    <div
                      key={inventoryStackKey(group)}
                      draggable={!rackActionBusy && !backpackVaultBusy}
                      title={t("inventory.modal.choose_machine")}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("inventoryId", String(firstId));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      /**
                       * CSS Grid (not flex-column): guarantees two distinct rows so the vault
                       * action can never share a flex line with stats (fixes overlap in narrow sidebar / WebKit).
                       */
                      className="grid cursor-grab select-none grid-cols-1 grid-rows-[auto_auto] gap-3 rounded-2xl border border-gray-800/50 bg-gray-800/30 p-4 transition-all hover:border-gray-700 active:cursor-grabbing"
                    >
                      <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3">
                        <div className="relative h-14 w-14 shrink-0 rounded-xl border border-gray-800/50 bg-gray-900/50 p-2">
                          <img
                            src={sideImg}
                            alt={sideName}
                            className="h-full w-full object-contain"
                            onError={(e: SyntheticEvent<HTMLImageElement>) => {
                              e.currentTarget.src = DEFAULT_MINER_IMAGE_URL;
                            }}
                          />
                          <div className="absolute -right-2 -top-2 z-[1] rounded-full border border-primary/20 bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">x{group.quantity}</div>
                        </div>
                        <div className="min-w-0">
                          <h4 className="break-words text-sm font-bold leading-snug text-white">{sideName}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <span className="shrink-0 whitespace-nowrap">
                              {t("inventory.modal.level")} {group.level}
                            </span>
                            <span aria-hidden>·</span>
                            <span className="font-black text-primary">{formatHashrate(group.hashRate)}</span>
                          </div>
                          {group.quantity > 1 && (
                            <p className="mt-1 text-[10px] font-medium normal-case tracking-normal text-gray-600">
                              {t("inventory.backpack_qty_hint", { count: group.quantity - 1 })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className="col-span-full flex w-full min-w-0 flex-col items-stretch gap-2 border-t border-gray-800/40 pt-3"
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={backpackVaultBusy || !Number.isFinite(Number(firstId))}
                          onClick={() => setBackpackWarehouseModal(group)}
                          className="relative z-[2] flex min-h-11 w-full max-w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-violet-500/35 bg-violet-500/15 px-2 py-2.5 text-center text-[10px] font-black uppercase leading-tight tracking-wider text-violet-200 transition-colors hover:bg-violet-500/25 disabled:pointer-events-none disabled:opacity-40 sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-[11px]"
                        >
                          <Warehouse className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          <span className="max-w-full break-words leading-snug">
                            {t("inventory.backpack_send_warehouse")}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {hasMoreInventoryGroups && (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleInventoryGroupsCount((current) =>
                        Math.min(current + SIDEBAR_GROUP_PAGE_SIZE, groupedInventory.length)
                      )
                    }
                    className="min-h-11 w-full rounded-2xl border border-gray-800/70 bg-gray-900/70 px-4 py-3 text-sm font-bold text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-800"
                  >
                    {t("common.load_more", { defaultValue: "Carregar mais" })}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          groupedInventory={groupedInventory}
          onInstall={handleInstall}
          onRemove={handleRemove}
          onMoveToVault={handleMoveRackToVault}
          actionBusy={rackActionBusy}
          onClose={() => {
            setSelectedSlot(null);
            setBackpackWarehouseModal(null);
          }}
        />
      )}
    </div>
  );
}
