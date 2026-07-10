import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  ChevronRight,
  Clock,
  ExternalLink,
  QrCode,
  ShieldCheck,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { WalletTransactionRow } from "../wallet.types";

export function WalletStatusBadge({ status, t }: { status: string; t: TFunction }) {
  const config: Record<string, { color: string; label: string }> = {
    completed: { color: "text-emerald-400 bg-emerald-400/10", label: t("wallet.ledger_badge_success") },
    pending: { color: "text-amber-400 bg-amber-400/10", label: t("wallet.ledger_badge_pending") },
    approved: { color: "text-sky-400 bg-sky-400/10", label: t("wallet.ledger_badge_approved") },
    failed: { color: "text-red-400 bg-red-400/10", label: t("wallet.ledger_badge_failed") },
  };
  const s = config[status] ?? config.pending;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${s.color}`}>
      {s.label}
    </span>
  );
}

type BalanceOverview = {
  amount: number;
  blkBalance: number;
  blkLocked: number;
  shibBalance: number;
  lifetimeMined: number;
  totalWithdrawn: number;
};

export function WalletBalanceOverview({
  balance,
  polPrice,
  t,
}: {
  balance: BalanceOverview;
  polPrice: number;
  t: TFunction;
}) {
  return (
    <div className="relative group overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-blue-600 to-indigo-900 opacity-90 transition-opacity" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />

      <div className="relative p-5 sm:p-10 text-white space-y-5 sm:space-y-12">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-blue-100/60 font-black uppercase tracking-[0.3em] text-[9px] mb-3">
              {t("wallet.web3_deposit.your_balance_label")}
            </p>
            <div className="flex items-baseline gap-4">
              <h2 className="text-3xl sm:text-6xl font-black tracking-tighter tabular-nums drop-shadow-2xl">
                {balance.amount.toLocaleString(undefined, { minimumFractionDigits: 6 })}
              </h2>
              <div className="flex flex-col">
                <span className="text-lg sm:text-2xl font-black text-blue-200/80 italic">POL</span>
                {polPrice > 0 && (
                  <span className="text-xs font-bold text-white/50">
                    ≈ ${(balance.amount * polPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="p-4 bg-white/10 backdrop-blur-2xl rounded-[1.5rem] border border-white/20 hover:scale-110 transition-transform cursor-pointer">
            <TrendingUp className="w-8 h-8 text-blue-200" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8 pt-5 sm:pt-10 border-t border-white/10">
          <div className="space-y-1">
            <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t("wallet.lifetime_mined")}</p>
            <p className="text-lg font-black tracking-tight">
              {balance.lifetimeMined.toFixed(4)} <span className="text-[10px] opacity-40">POL</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t("wallet.total_withdrawn")}</p>
            <p className="text-lg font-black tracking-tight">
              {balance.totalWithdrawn.toFixed(4)} <span className="text-[10px] opacity-40">POL</span>
            </p>
          </div>
          <div className="hidden md:block space-y-1">
            <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t("wallet.network_status")}</p>
            <p className="text-lg font-black tracking-tight flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              {t("wallet.network_polygon")}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-blue-100/50 font-black uppercase tracking-[0.25em] text-[8px] mb-1 flex items-center gap-2">
              <Banknote className="w-3 h-3" /> {t("wallet.blk_equiv_note")}
            </p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight">
              {balance.blkBalance.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}
              <span className="text-sm sm:text-lg text-blue-200/70 ml-2">BLK</span>
            </p>
            {balance.blkLocked > 0 && (
              <p className="text-[10px] font-bold text-amber-200/90 mt-1">
                {t("wallet.blk_locked_line", { amount: balance.blkLocked.toFixed(8) })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3">
            <img
              src="/shib.png"
              alt="SHIB"
              className="w-7 h-7 rounded-full shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div>
              <p className="text-orange-200/50 font-black uppercase tracking-[0.25em] text-[8px] mb-0.5">SHIBA INU</p>
              <p className="text-xl font-black tabular-nums tracking-tight text-orange-100">
                {balance.shibBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                <span className="text-sm text-orange-300/70 ml-1.5">SHIB</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute right-[-20px] bottom-[-20px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-1000 pointer-events-none">
        <WalletIcon className="w-64 h-64" />
      </div>
    </div>
  );
}

export function WalletLedgerPanel({
  transactions,
  polPrice,
  t,
}: {
  transactions: WalletTransactionRow[];
  polPrice: number;
  t: TFunction;
}) {
  return (
    <div className="bg-slate-950/80 border border-slate-800/50 rounded-[2.5rem] p-4 sm:p-8 shadow-2xl flex flex-col max-h-[700px]">
      <div className="flex items-center justify-between mb-4 sm:mb-8">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          {t("wallet.ledger_title")}
        </h3>
        <ChevronRight className="w-4 h-4 text-slate-700" />
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-hide">
        {transactions.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-20">
            <QrCode className="w-12 h-12" />
            <p className="text-[10px] font-black uppercase tracking-widest">{t("wallet.ledger_empty")}</p>
          </div>
        ) : (
          transactions.map((tx, i) => {
            const txKey =
              (typeof tx.txHash === "string" && tx.txHash.trim() !== "" ? tx.txHash : null) ??
              (typeof tx.createdAt === "string" && tx.createdAt
                ? tx.createdAt
                : typeof tx.created_at === "string" && tx.created_at
                  ? tx.created_at
                  : null) ??
              `${tx.type}-${tx.amount}-${i}`;
            const isBlkConvert = tx.type === "blk_convert";
            const isBlkWithdraw = tx.type === "blk_withdrawal";
            const isWithdrawal = tx.type === "withdrawal" || isBlkWithdraw;
            const unit = isBlkConvert || isBlkWithdraw ? "BLK" : "POL";
            const usdSub =
              isBlkConvert || isBlkWithdraw
                ? `≈ $${Number(tx.amount).toFixed(2)}`
                : polPrice > 0
                  ? `$${(Number(tx.amount) * polPrice).toFixed(2)}`
                  : null;
            const label = isBlkConvert
              ? t("wallet.tx_pol_to_blk")
              : isBlkWithdraw
                ? t("wallet.tx_blk_legacy")
                : isWithdrawal
                  ? t("wallet.tx_outflow")
                  : t("wallet.tx_inflow");
            return (
              <div
                key={txKey}
                className="group relative flex items-center gap-4 p-4 hover:bg-slate-900/50 rounded-2xl transition-all border border-transparent hover:border-slate-800/50"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                    isWithdrawal ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
                  }`}
                >
                  {isBlkConvert ? (
                    <Banknote className="w-6 h-6" />
                  ) : isWithdrawal ? (
                    <ArrowUpCircle className="w-6 h-6" />
                  ) : (
                    <ArrowDownCircle className="w-6 h-6" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-white italic uppercase tracking-tighter">{label}</span>
                    <WalletStatusBadge status={tx.status} t={t} />
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-bold text-slate-500 font-mono">
                      {new Date(tx.createdAt ?? tx.created_at ?? 0).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className={`text-sm font-black italic tracking-tighter ${isWithdrawal ? "text-red-400" : "text-emerald-400"}`}>
                      {isWithdrawal ? "-" : "+"}
                      {Number(tx.amount).toFixed(4)} {unit}
                      {usdSub && <span className="block text-[8px] opacity-50 not-italic text-right">{usdSub}</span>}
                    </p>
                  </div>
                </div>

                {tx.txHash && (
                  <a
                    href={`https://polygonscan.com/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute right-0 top-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-primary"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 pt-4 sm:mt-8 sm:pt-8 border-t border-slate-900">
        <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight leading-relaxed">
            All transactions are secured by Polygon Smart Contracts and verified on-chain.
          </p>
        </div>
      </div>
    </div>
  );
}
