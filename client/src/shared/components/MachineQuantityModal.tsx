import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type MachineQuantityModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  quantityLabel?: string;
  max: number | string;
  min?: number;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: (qty: number) => void;
};

/**
 * Modal to pick how many stacked machines to transfer (vault → inventory, backpack → warehouse).
 */
export default function MachineQuantityModal({
  open,
  onClose,
  title,
  subtitle,
  quantityLabel,
  max,
  min = 1,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
}: MachineQuantityModalProps) {
  const [qty, setQty] = useState(min);

  useEffect(() => {
    if (!open) return;
    const safeMax = Math.max(min, Number(max) || min);
    setQty(safeMax);
  }, [open, max, min]);

  if (!open || typeof document === "undefined") return null;

  const safeMax = Math.max(min, Number(max) || min);
  const clamped = Math.min(safeMax, Math.max(min, Number(qty) || min));

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-gray-800 bg-surface p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-black text-white">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm text-gray-400">{subtitle}</p> : null}
        <label className="mt-6 block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            {quantityLabel ?? ""}
          </span>
          <input
            type="number"
            min={min}
            max={safeMax}
            disabled={busy}
            value={clamped}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isFinite(n)) {
                setQty(min);
                return;
              }
              setQty(Math.min(safeMax, Math.max(min, n)));
            }}
            className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-900/80 px-4 py-3 text-lg font-black tabular-nums text-white outline-none ring-primary/30 focus:ring-2 disabled:opacity-50"
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-xl border border-gray-700 px-5 py-2.5 text-sm font-bold text-gray-300 transition-colors hover:bg-gray-800/50 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(clamped)}
            className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
