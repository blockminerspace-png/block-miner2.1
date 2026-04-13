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
              <div className="flex items-center gap-6 p-4 bg-gray-800/20 rounded-2xl border border-gray-800/50">
                <div className="w-20 h-20 bg-gray-900/50 rounded-2xl p-3 border border-gray-800/50">
                  <img src={descriptor.image} alt={descriptor.name} className="w-full h-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">{machine.minerName || descriptor.name}</h4>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex flex-col"><span className="text-[10px] font-bold text-gray-600 uppercase">{t("inventory.modal.level")}</span><span className="text-sm font-bold text-gray-300">{machine.level}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-bold text-gray-600 uppercase">{t("inventory.modal.hashrate")}</span><span className="text-sm font-bold text-primary uppercase">{formatHashrate(machine.hashRate)}</span></div>
                    {machine.slotSize >= 2 && (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-600 uppercase">{t("inventory.modal.slots")}</span>
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
                      className={`group w-full min-h-[3.25rem] px-4 py-3.5 rounded-2xl font-bold text-sm transition-all border flex flex-col sm:flex-row items-center justify-center gap-2 text-center sm:text-left disabled:opacity-50 disabled:pointer-events-none ${
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
                      className={`group w-full min-h-[3.25rem] px-4 py-3.5 rounded-2xl font-bold text-sm transition-all border flex flex-col sm:flex-row items-center justify-center gap-2 text-center sm:text-left disabled:opacity-50 disabled:pointer-events-none ${
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
                      className="w-full min-h-[2.75rem] py-3 bg-gray-900/90 text-gray-400 rounded-2xl font-semibold text-sm transition-all border border-gray-800 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
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
                      <button key={group.id} onClick={() => onInstall(slot.rack.id, group.items[0].id)} className="w-full p-4 bg-gray-800/30 hover:bg-primary/10 border border-gray-800 hover:border-primary/30 rounded-2xl flex items-center justify-between transition-all">
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
            className="w-8 h-8 shrink-0 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
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
                className={`relative rounded-2xl border ${
                  isOccupied
                    ? "border-primary/30 bg-primary/5"
                    : isDragTarget
                    ? "border-primary bg-primary/15 scale-[1.04] shadow-glow"
                    : "border-gray-800/50 bg-gray-900/30 hover:border-gray-700"
                } transition-all duration-200 group flex items-center justify-center ${isDoubleSlot ? 'aspect-[2/1]' : 'aspect-square'}`}
              >
                {isOccupied ? (
                  <>
                    <img src={descriptor.image} alt="" className="w-full h-full object-contain group-hover:scale-110 transition-transform pointer-events-none" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                    <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary pointer-events-none" />
                    {isDoubleSlot && (
                      <div className="absolute bottom-1 left-1 bg-amber-500/80 text-black text-[7px] font-black px-1 rounded pointer-events-none leading-tight">2×</div>
                    )}
                  </>
                ) : isDragTarget ? (
                  <Plus className="w-6 h-6 text-primary animate-pulse" />
                ) : (
                  <Plus className="w-5 h-5 text-gray-700 group-hover:text-gray-500 transition-colors" />
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t("inventory.title")}</h1>
          <p className="text-gray-500 font-medium">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs font-bold text-purple-400 flex items-center gap-1.5 shadow-glow-sm">
            <Zap className="w-3.5 h-3.5" />{formatHashrate(activeMachinesHashRate)}
          </div>
          <div className="px-4 py-2 bg-gray-800/50 border border-gray-700/50 rounded-xl text-xs font-bold text-gray-400">
            {summary.occupiedRacks} {t("inventory.active_machines")}
          </div>
          <div className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold text-primary">
            {inventory.length} {t("inventory.in_inventory")}
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="tablist">
        {rooms.map((room) => {
          const isActive = room.roomNumber === activeRoom;
          const isUnlocked = room.unlocked;
          return (
            <button key={room.roomNumber} role="tab" aria-selected={isActive} onClick={() => setActiveRoom(room.roomNumber)}
              className={`shrink-0 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${isActive ? "bg-primary text-black shadow-glow" : isUnlocked ? "bg-gray-800/50 text-gray-300 hover:bg-gray-700/50" : "bg-gray-900/30 text-gray-500 hover:text-gray-400"}`}>
              {!isUnlocked && <Lock className="w-3 h-3" />}
              {t("inventory.room_label", "Sala")} {room.roomNumber}
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Box className="w-5 h-5 text-primary" /> {t("sidebar.machines")}
              </h2>
              <button
                type="button"
                onClick={() => navigate('/vault')}
                className="rounded-2xl bg-secondary/10 border border-secondary/20 text-secondary px-3 py-2 text-xs font-bold uppercase tracking-[0.24em] hover:bg-secondary/20 transition-colors"
              >
                {t('inventory.go_to_warehouse', 'Ir para o Armazém')}
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
                      className="bg-gray-800/30 border border-gray-800/50 rounded-2xl p-4 flex items-center gap-3 sm:gap-4 hover:border-gray-700 transition-all cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="w-14 h-14 bg-gray-900/50 rounded-xl p-2 border border-gray-800/50 shrink-0 relative">
                        <img src={descriptor.image} alt={group.minerName} className="w-full h-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                        <div className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-primary/20">x{group.quantity}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{group.minerName}</h4>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          <span>{t("inventory.modal.level")} {group.level}</span>
                          <span>·</span>
                          <span className="text-primary font-black">{formatHashrate(group.hashRate)}</span>
                        </div>
                        {group.quantity > 1 && (
                          <p className="text-[10px] text-gray-600 mt-1 font-medium normal-case tracking-normal">
                            {t("inventory.backpack_qty_hint", { count: group.quantity - 1 })}
                          </p>
                        )}
                      </div>
                      <div
                        className="shrink-0 flex flex-col items-stretch gap-1.5"
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
                          className={`min-h-[2.75rem] px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${
                            isConfirming
                              ? "bg-violet-600 text-white border-violet-500"
                              : "bg-violet-500/15 text-violet-200 border-violet-500/35 hover:bg-violet-500/25"
                          }`}
                        >
                          <Warehouse className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
                          <span className="leading-tight text-center">
                            {isConfirming ? t("inventory.backpack_confirm_warehouse") : t("inventory.backpack_send_warehouse")}
                          </span>
                        </button>
                        {isConfirming && (
                          <button
                            type="button"
                            disabled={backpackVaultBusy}
                            onClick={() => setVaultBackpackConfirmId(null)}
                            className="text-[10px] font-bold text-gray-500 hover:text-gray-300 py-1"
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
