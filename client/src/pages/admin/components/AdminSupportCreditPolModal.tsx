import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../store/auth";

type Props = {
  open: boolean;
  ticketId: number | null;
  playerLabel?: string | null;
  onClose: () => void;
  onCredited?: (info: { amount: number; polBalance: number | null }) => void;
};

type CreditPolResponse = {
  ok: boolean;
  message?: string;
  amount?: number;
  polBalance?: number | null;
};

export default function AdminSupportCreditPolModal({ open, ticketId, playerLabel, onClose, onCredited }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open || !ticketId) return null;

  async function handleSubmit() {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error(t("admin_support.credit_pol.invalid_amount"));
      return;
    }
    if (parsed > 1000) {
      toast.error(t("admin_support.credit_pol.amount_too_high"));
      return;
    }
    if (reason.trim().length < 3) {
      toast.error(t("admin_support.credit_pol.reason_required"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<CreditPolResponse>(`/admin/support/${ticketId}/credit-pol`, {
        amount: parsed,
        reason: reason.trim(),
      });
      if (res.data?.ok) {
        toast.success(t("admin_support.credit_pol.success", { amount: parsed.toFixed(6) }));
        onCredited?.({ amount: parsed, polBalance: res.data.polBalance ?? null });
        onClose();
      } else {
        toast.error(res.data?.message || t("admin_support.credit_pol.error"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || t("admin_support.credit_pol.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-500">
            <Wallet className="h-4 w-4" />
            {t("admin_support.credit_pol.title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-800 p-1 text-slate-400 hover:text-white"
            aria-label={t("admin_support.credit_pol.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {playerLabel ? (
          <p className="mb-3 text-xs text-slate-400">
            {t("admin_support.credit_pol.target", { player: playerLabel })}
          </p>
        ) : null}

        <label className="mb-3 block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t("admin_support.credit_pol.amount_label")}
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.000001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.000000"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 font-mono text-sm text-white focus:border-amber-500/60 focus:outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t("admin_support.credit_pol.reason_label")}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("admin_support.credit_pol.reason_placeholder")}
            className="w-full resize-none rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-500/60 focus:outline-none"
          />
        </label>

        <p className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
          {t("admin_support.credit_pol.warning")}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-300 hover:bg-slate-900 disabled:opacity-50"
          >
            {t("admin_support.credit_pol.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
            {t("admin_support.credit_pol.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
