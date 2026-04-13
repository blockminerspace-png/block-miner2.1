import { useEffect, useState, useCallback, useMemo, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Lock, Plus, Zap, Trash2, Box, AlertCircle, X, Warehouse } from "lucide-react";
import { api } from "../store/auth";
import { useGameStore } from "../store/game";
import { formatHashrate, DEFAULT_MINER_IMAGE_URL, getMachineDescriptor } from "../utils/machine";
import { dedupeOccupiedSlotsForDismantle } from "../utils/inventoryRackUtils.js";
import RackMachineTooltipPortal from "../components/inventory/RackMachineTooltipPortal.jsx";

const RACK_TOOLTIP_SHOW_MS = 120;
const RACK_TOOLTIP_HIDE_MS = 80;

const SLOTS_PER_VISUAL_RACK = 8;

function groupIntoRacks(racks) {
  const groups = [];
  for (let r = 0; r < Math.ceil(racks.length / SLOTS_PER_VISUAL_RACK); r++) {
    groups.push({ rackNumber: r + 1, slots: racks.slice(r * SLOTS_PER_VISUAL_RACK, (r + 1) * SLOTS_PER_VISUAL_RACK) });
  }
  return groups;
}

/**
 * Accessible confirmation dialog for dismantling every machine in one visual rack.
 * Focus trap, Escape to close (when not loading), and restore focus are handled by the parent via onClose.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => Promise<void>} props.onConfirm
 * @param {number} props.displayRackNumber Global rack label shown in the header (room offset + local index).
 * @param {boolean} props.loading When true, actions are disabled and Escape is ignored.
 */
function RackDismantleModal({ open, onClose, onConfirm, displayRackNumber, loading }) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const titleId = useId();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const focusClose = () => {
      closeButtonRef.current?.focus();
    };
    const id = requestAnimationFrame(focusClose);

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (!loading) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusable).filter((el) => el.getClientRects().length > 0);
      if (list.length === 0) return;

      const first = list[0];
      const last = list[list.length - 1];
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

function SlotModal({ slot, inventory, onInstall, onRemove, onMoveToVault, onClose }) {
  const { t } = useTranslation();
  const [confirmingAction, setConfirmingAction] = useState(/** @type {'inventory' | 'vault' | null} */ (null));
  const [busy, setBusy] = useState(false);
  const machine = slot.miner || null;

  useEffect(() => {
    setConfirmingAction(null);
    setBusy(false);
  }, [slot]);

  const groupedInventory = useMemo(() => {
    const groups = {};
    for (const item of inventory) {
      const key = `${item.minerName}_${item.level}_${item.hashRate}_${item.slotSize ?? 0}_${item.minerId ?? ""}`;
      if (!groups[key]) groups[key] = { ...item, quantity: 1, items: [item] };
      else { groups[key].quantity += 1; groups[key].items.push(item); }
    }
    return Object.values(groups).sort((a, b) => b.hashRate - a.hashRate);
  }, [inventory]);
  const descriptor = machine ? getMachineDescriptor(machine) : null;
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-surface border border-gray-800 rounded-[2rem] w-full max-w-[min(100vw-2rem,30rem)] max-h-[calc(100vh-2rem)] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="px-4 pt-6 pb-4 sm:px-8 sm:pt-8 sm:pb-6 flex items-center justify-between border-b border-gray-800/50">
          <div>
            <h3 className="text-xl font-bold text-white">{machine ? t("inventory.modal.details_title") : t("inventory.modal.install_title")}</h3>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">{t("inventory.modal.rack_slot", { rack: slot.visualRackNumber, slot: slot.slotInRack + 1 })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="w-10 h-10 rounded-xl bg-gray-800/50 text-gray-400 flex items-center justify-center hover:text-white transition-colors">
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>
        <div className="p-4 sm:p-8 max-h-[calc(100vh-18rem)] overflow-y-auto">
          {machine ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-2xl border border-gray-800/50 bg-gray-800/20 p-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-gray-800/50 bg-gray-900/50 p-3 sm:mx-0">
                  <img src={descriptor.image} alt={descriptor.name} className="max-h-full max-w-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <h4 className="text-lg font-bold leading-snug text-white break-words">{machine.minerName || descriptor.name}</h4>
                  <div className="mt-2 flex flex-wrap items-start justify-center gap-4 sm:justify-start">
                    <div className="flex flex-col items-center sm:items-start"><span className="text-[10px] font-bold uppercase text-gray-600">{t("inventory.modal.level")}</span><span className="text-sm font-bold text-gray-300">{machine.level}</span></div>
                    <div className="flex flex-col items-center sm:items-start"><span className="text-[10px] font-bold uppercase text-gray-600">{t("inventory.modal.hashrate")}</span><span className="text-sm font-bold uppercase text-primary">{formatHashrate(machine.hashRate)}</span></div>
                    {machine.slotSize >= 2 && (
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
                      disabled={busy}
                      onClick={async () => {
                        if (confirmingAction === "inventory") {
                          setBusy(true);
                          try {
                            await onRemove(slot.rack.id);
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
                      disabled={busy || !Number.isFinite(Number(machine.id))}
                      onClick={async () => {
                        if (confirmingAction === "vault") {
                          setBusy(true);
                          try {
                            await onMoveToVault(Number(machine.id));
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
                      disabled={busy}
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
                  {groupedInventory.map((group) => {
                    const desc = getMachineDescriptor({ hashRate: group.hashRate, slotSize: group.slotSize, imageUrl: group.imageUrl });
                    return (
                      <button key={group.id} type="button" onClick={() => onInstall(slot.rack.id, group.items[0].id)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-800/30 p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/10">
                        <div className="flex items-center gap-3 text-left">
                          <div className="w-10 h-10 bg-gray-900 rounded-lg p-2 shrink-0 relative">
                            <img src={desc.image} alt={group.minerName} className="w-full h-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                            <div className="absolute -top-2 -right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-primary/20">x{group.quantity}</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{group.minerName}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">{formatHashrate(group.hashRate)}</div>
                          </div>
                        </div>
                        <Plus className="w-5 h-5 text-gray-600" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function RackCard({ rackNumber, slots, onSlotClick, onSlotDrop, onDismantleRack, rackDismantleLoading }) {
  const { t } = useTranslation();
  const [dragOverId, setDragOverId] = useState(null);
  const [confirmingDismantle, setConfirmingDismantle] = useState(false);
  const [machineTip, setMachineTip] = useState(null);
  const [hoverFinePointer, setHoverFinePointer] = useState(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

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
    (anchorEl, payload) => {
      clearShowTimer();
      cancelScheduledHide();
      setMachineTip({ anchorEl, ...payload });
    },
    [clearShowTimer, cancelScheduledHide]
  );

  const scheduleShowMachineTip = useCallback(
    (anchorEl, payload) => {
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

  const hasMachines = slots.some((slot) => slot?.miner);

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
            disabled={rackDismantleLoading}
            title={t("inventory.dismantle_rack_tooltip")}
            aria-label={t("inventory.dismantle_rack_aria")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="w-4 h-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
      <div className="p-2.5 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {(() => {
          const rendered = [];
          let i = 0;
          while (i < slots.length) {
            const rack = slots[i];
            const machine = rack ? rack.miner : null;
            const descriptor = machine ? getMachineDescriptor(machine) : null;
            const isOccupied = !!machine;
            const isBlocked = !machine && !!rack?.blockedByMinerId;
            const isDoubleSlot = isOccupied && machine.slotSize >= 2;
            const slotKey = rack?.id ?? i;
            const isDragTarget = dragOverId === slotKey;

            // Skip cells blocked by a two-slot miner (rendered as col-span-2 on the primary cell)
            if (isBlocked) {
              i++;
              continue;
            }

            const displayName = machine ? (machine.minerName || descriptor.name) : "";
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

            const machineTipPayload = {
              slotKey: stableSlotKey,
              displayName,
              hashrateStr,
              slotSize: slotSizeNum,
            };

            rendered.push(
              <button
                key={rack ? rack.id : i}
                type="button"
                aria-label={occupiedAria}
                onClick={() => onSlotClick({ rack, miner: machine, visualRackNumber: rackNumber, slotInRack: i })}
                style={isDoubleSlot ? { gridColumn: 'span 2' } : {}}
                onDragOver={!isOccupied ? (e) => { e.preventDefault(); setDragOverId(slotKey); } : undefined}
                onDragLeave={!isOccupied ? () => setDragOverId(null) : undefined}
                onDrop={!isOccupied ? (e) => { e.preventDefault(); setDragOverId(null); const id = parseInt(e.dataTransfer.getData('inventoryId'), 10); if (id && rack?.id) onSlotDrop(rack.id, id); } : undefined}
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
                className={`group relative flex min-h-[5.25rem] flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border p-1.5 text-center transition-all duration-200 sm:min-h-0 ${
                  isOccupied
                    ? "border-primary/30 bg-primary/5"
                    : isDragTarget
                    ? "scale-[1.02] border-primary bg-primary/15 shadow-glow sm:scale-[1.04]"
                    : "border-gray-800/50 bg-gray-900/30 hover:border-gray-700"
                } ${isDoubleSlot ? "sm:aspect-[2/1]" : "sm:aspect-square"}`}
              >
                {isOccupied ? (
                  <>
                    <div className="pointer-events-none flex min-h-0 w-full flex-1 items-center justify-center p-1 sm:p-2">
                      <img
                        src={descriptor.image}
                        alt=""
                        className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                        onError={(e) => {
                          e.target.src = DEFAULT_MINER_IMAGE_URL;
                        }}
                      />
                    </div>
                    <div className="pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    {isDoubleSlot && (
                      <div className="pointer-events-none absolute bottom-1 left-1 rounded bg-amber-500/90 px-1 text-[7px] font-black leading-tight text-black">2×</div>
                    )}
                  </>
                ) : isDragTarget ? (
                  <div className="flex flex-col items-center justify-center gap-0.5 px-0.5">
                    <Plus className="h-6 w-6 shrink-0 animate-pulse text-primary" aria-hidden />
                    <span className="hidden text-[8px] font-bold uppercase leading-tight text-primary/90 sm:inline">{t("inventory.slot_add_machine")}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 px-0.5">
                    <Plus className="h-5 w-5 shrink-0 text-gray-600 transition-colors group-hover:text-gray-400" aria-hidden />
                    <span className="max-w-[5.5rem] text-[8px] font-bold uppercase leading-tight tracking-wide text-gray-500 group-hover:text-gray-400 sm:max-w-none sm:text-[9px]">
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
}

export default function Inventory() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [summary, setSummary] = useState({ totalRacks: 0, occupiedRacks: 0, freeRacks: 0 });
  const [loading, setLoading] = useState(true);
  const [buyingRoom, setBuyingRoom] = useState(false);
  const [rackDismantleLoading, setRackDismantleLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [activeRoom, setActiveRoom] = useState(1);
  /** First inventory row id pending confirm for backpack → warehouse (vault). */
  const [vaultBackpackConfirmId, setVaultBackpackConfirmId] = useState(null);
  const [backpackVaultBusy, setBackpackVaultBusy] = useState(false);
  const navigate = useNavigate();
  const fetchMachines = useGameStore((s) => s.fetchMachines);
  const fetchVault = useGameStore((s) => s.fetchVault);

  const fetchData = useCallback(async () => {
    try {
      const [roomsRes, invRes] = await Promise.all([api.get("/rooms"), api.get("/inventory")]);
      if (roomsRes.data.ok) {
        setRooms(roomsRes.data.rooms);
        setSummary({ totalRacks: roomsRes.data.totalRacks, occupiedRacks: roomsRes.data.occupiedRacks, freeRacks: roomsRes.data.freeRacks });
      }
      if (invRes.data.ok) setInventory(invRes.data.inventory || []);
    } catch {
      toast.error(t("inventory.load_error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBuyRoom = async (roomNumber) => {
    setBuyingRoom(true);
    try {
      const res = await api.post("/rooms/buy");
      if (res.data.ok) { toast.success(t("inventory.room_unlocked", { room: roomNumber })); setActiveRoom(roomNumber); await fetchData(); }
      else toast.error(res.data.message || t("common.error"));
    } catch (err) { toast.error(err?.response?.data?.message || t("common.error")); }
    finally { setBuyingRoom(false); }
  };

  const handleInstall = async (rackId, inventoryId) => {
    if (!Number.isInteger(rackId) || rackId <= 0 || !Number.isInteger(inventoryId) || inventoryId <= 0) { toast.error(t("common.error")); return; }
    try {
      const res = await api.post("/rooms/rack/install", { rackId, inventoryId });
      if (res.data.ok) { toast.success(t("inventory.install_success")); setSelectedSlot(null); await fetchData(); }
      else toast.error(res.data.message || t("common.error"));
    } catch (err) { toast.error(err?.response?.data?.message || t("common.error")); }
  };

  const handleRemove = async (rackId) => {
    if (!Number.isInteger(rackId) || rackId <= 0) { toast.error(t("common.error")); return; }
    try {
      const res = await api.post("/rooms/rack/uninstall", { rackId });
      if (res.data.ok) { toast.success(t("inventory.remove_success")); setSelectedSlot(null); await fetchData(); }
      else toast.error(res.data.message || t("common.error"));
    } catch (err) { toast.error(err?.response?.data?.message || t("common.error")); }
  };

  const handleMoveInventoryToVault = async (inventoryItemId) => {
    const id = Number(inventoryItemId);
    if (!Number.isInteger(id) || id <= 0) {
      toast.error(t("common.error"));
      return;
    }
    setBackpackVaultBusy(true);
    try {
      const res = await api.post("/vault/move-to-vault", { source: "inventory", itemId: id });
      if (res.data.ok) {
        toast.success(t("vault.move_success"));
        setVaultBackpackConfirmId(null);
        await fetchData();
        await fetchMachines();
        await fetchVault();
      } else {
        toast.error(res.data.message || t("vault.move_error"));
      }
    } catch (err) {
      const apiCode = err?.response?.data?.code;
      if (apiCode) {
        const key = `vault.errors.${apiCode}`;
        const translated = t(key);
        if (translated !== key) {
          toast.error(translated);
          return;
        }
      }
      toast.error(err?.response?.data?.message || t("vault.move_error"));
    } finally {
      setBackpackVaultBusy(false);
    }
  };

  const handleMoveRackToVault = async (userMinerId) => {
    const id = Number(userMinerId);
    if (!Number.isInteger(id) || id <= 0) {
      toast.error(t("common.error"));
      return;
    }
    try {
      const res = await api.post("/vault/move-to-vault", { source: "rack", itemId: id });
      if (res.data.ok) {
        toast.success(t("vault.move_success"));
        setSelectedSlot(null);
        await fetchData();
        await fetchMachines();
        await fetchVault();
      } else {
        toast.error(res.data.message || t("vault.move_error"));
      }
    } catch (err) {
      const apiCode = err?.response?.data?.code;
      if (apiCode) {
        const key = `vault.errors.${apiCode}`;
        const translated = t(key);
        if (translated !== key) {
          toast.error(translated);
          return;
        }
      }
      if (err?.response?.status === 409) {
        toast.error(t("vault.move_conflict"));
      } else {
        toast.error(err?.response?.data?.message || t("vault.move_error"));
      }
    }
  };

  /**
   * Uninstalls every occupied slot in one visual rack (same API as single-slot removal).
   * Uses slot rows from the current room payload so rack numbering stays correct across rooms.
   *
   * @param {Array<{ id?: number, miner?: object }>} slots Eight slot records for the visual rack.
   * @returns {Promise<void>}
   */
  const handleRemoveRackSlots = useCallback(
    async (slots) => {
      const occupied = dedupeOccupiedSlotsForDismantle(slots || []);
      if (occupied.length === 0) return;

      setRackDismantleLoading(true);
      try {
        for (const slot of occupied) {
          const res = await api.post("/rooms/rack/uninstall", { rackId: slot.id });
          if (!res.data?.ok) {
            toast.error(res.data?.message || t("common.error"));
            await fetchData();
            throw new Error("UNINSTALL_FAILED");
          }
        }
        toast.success(t("inventory.dismantle_rack_success"));
        await fetchData();
      } catch (err) {
        if (err?.message !== "UNINSTALL_FAILED") {
          toast.error(err?.response?.data?.message || t("common.error"));
          await fetchData();
        }
        throw err;
      } finally {
        setRackDismantleLoading(false);
      }
    },
    [t, fetchData]
  );

  const groupedInventory = useMemo(() => {
    const groups = {};
    for (const item of inventory) {
      const key = `${item.minerName}_${item.level}_${item.hashRate}_${item.slotSize ?? 0}_${item.minerId ?? ""}`;
      if (!groups[key]) groups[key] = { ...item, quantity: 1, items: [item] };
      else { groups[key].quantity += 1; groups[key].items.push(item); }
    }
    return Object.values(groups).sort((a, b) => b.hashRate - a.hashRate);
  }, [inventory]);

  const activeMachinesHashRate = useMemo(() =>
    rooms.flatMap(r => r.racks || []).filter(rack => rack.miner).reduce((sum, rack) => sum + Number(rack.miner?.hashRate || 0), 0), [rooms]);

  const currentRoom = rooms.find(r => r.roomNumber === activeRoom) || null;
  const visualRacksOfCurrent = currentRoom?.unlocked ? groupIntoRacks(currentRoom.racks || []) : [];
  const rackOffset = currentRoom ? (currentRoom.roomNumber - 1) * (visualRacksOfCurrent.length || 24) : 0;

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
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
                    onSlotClick={(slot) => {
                      setVaultBackpackConfirmId(null);
                      setSelectedSlot(slot);
                    }}
                    onSlotDrop={handleInstall}
                    onDismantleRack={handleRemoveRackSlots}
                    rackDismantleLoading={rackDismantleLoading}
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
                <button onClick={() => handleBuyRoom(currentRoom.roomNumber)} disabled={buyingRoom}
                  className="px-8 py-3 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/80 transition-all disabled:opacity-50 flex items-center gap-2">
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
            <div className="mb-4 rounded-3xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">{t("inventory.tip_msg")}</p>
              <p className="text-[10px] font-medium text-gray-500 normal-case tracking-normal leading-relaxed">
                {t("inventory.backpack_help")}
              </p>
            </div>
            {inventory.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-gray-800/20 rounded-2xl border border-dashed border-gray-800">
                <AlertCircle className="w-10 h-10 text-gray-700 mb-3" />
                <p className="text-gray-500 text-sm font-medium">{t("inventory.empty_inventory")}</p>
                <p className="text-gray-600 text-xs mt-1">{t("inventory.buy_miners_msg")}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
                {groupedInventory.map((group) => {
                  const descriptor = getMachineDescriptor({ hashRate: group.hashRate, slotSize: group.slotSize, imageUrl: group.imageUrl });
                  const firstId = group.items[0]?.id;
                  const isConfirming = vaultBackpackConfirmId === firstId;
                  return (
                    <div
                      key={group.id}
                      draggable
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
                          <img src={descriptor.image} alt={group.minerName} className="h-full w-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                          <div className="absolute -right-2 -top-2 z-[1] rounded-full border border-primary/20 bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">x{group.quantity}</div>
                        </div>
                        <div className="min-w-0">
                          <h4 className="break-words text-sm font-bold leading-snug text-white">{group.minerName}</h4>
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
                          onClick={() => {
                            if (isConfirming) {
                              void handleMoveInventoryToVault(firstId);
                              return;
                            }
                            setVaultBackpackConfirmId(firstId);
                          }}
                          className={`relative z-[2] flex min-h-11 w-full max-w-full flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-center text-[10px] font-black uppercase leading-tight tracking-wider transition-colors disabled:pointer-events-none disabled:opacity-40 sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-[11px] ${
                            isConfirming
                              ? "border-violet-500 bg-violet-600 text-white"
                              : "border-violet-500/35 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                          }`}
                        >
                          <Warehouse className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          <span className="max-w-full break-words leading-snug">
                            {isConfirming ? t("inventory.backpack_confirm_warehouse") : t("inventory.backpack_send_warehouse")}
                          </span>
                        </button>
                        {isConfirming && (
                          <button
                            type="button"
                            disabled={backpackVaultBusy}
                            onClick={() => setVaultBackpackConfirmId(null)}
                            className="min-h-9 rounded-lg py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-800/50 hover:text-gray-300 disabled:opacity-40"
                          >
                            {t("common.cancel")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          inventory={inventory}
          onInstall={handleInstall}
          onRemove={handleRemove}
          onMoveToVault={handleMoveRackToVault}
          onClose={() => {
            setSelectedSlot(null);
            setVaultBackpackConfirmId(null);
          }}
        />
      )}
    </div>
  );
}
