import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Eye, Server, Wrench, Megaphone, Briefcase, Scale, Package,
  DollarSign, RefreshCw, ExternalLink, TrendingUp, TrendingDown,
  CheckCircle2, Clock, Wallet, Copy, Check as CheckIcon, ShieldCheck,
  BarChart2, Activity, ArrowUpRight, ImageIcon, AlertTriangle,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────────────

const INVESTMENT_WALLET = '0x1f4872991e6bFc74C2064E2fE4875a78503B5cc1';
const POLYGON_RPC = 'https://polygon-rpc.com';

const POOL_POSITIONS = [
  { id: 'XYaDWC63das', label: 'WBTC / USDC — Uniswap V3 (0.05%)', link: 'https://defi.krystal.app' },
];

const CATEGORY_ICONS = {
  infrastructure: Server,
  tooling:        Wrench,
  marketing:      Megaphone,
  payroll:        Briefcase,
  legal:          Scale,
  misc:           Package,
};

const CATEGORY_STYLE = {
  infrastructure: { color: '#60a5fa', tw: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  tooling:        { color: '#c084fc', tw: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  marketing:      { color: '#f472b6', tw: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/20'   },
  payroll:        { color: '#fbbf24', tw: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  legal:          { color: '#34d399', tw: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20'},
  misc:           { color: '#9ca3af', tw: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/20'   },
};

const INCOME_STYLE = {
  revenue:           { color: '#34d399', bg: 'bg-emerald-500/15', tw: 'text-emerald-400' },
  sponsorship:       { color: '#60a5fa', bg: 'bg-blue-500/15',    tw: 'text-blue-400'    },
  donation:          { color: '#f472b6', bg: 'bg-pink-500/15',    tw: 'text-pink-400'    },
  investment_return: { color: '#a78bfa', bg: 'bg-violet-500/15',  tw: 'text-violet-400'  },
  other:             { color: '#9ca3af', bg: 'bg-gray-500/15',    tw: 'text-gray-400'    },
};

const CATEGORY_ORDER = ['infrastructure', 'tooling', 'marketing', 'payroll', 'legal', 'misc'];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert any period amount to a monthly equivalent */
function toMonthly(amount, period) {
  const n = parseFloat(amount);
  if (period === 'daily')    return n * 30;
  if (period === 'monthly')  return n;
  if (period === 'annual')   return n / 12;
  return 0; // one_time excluded from monthly
}

/** Convert any period amount to an annual equivalent */
function toAnnual(amount, period) {
  const n = parseFloat(amount);
  if (period === 'daily')    return n * 365;
  if (period === 'monthly')  return n * 12;
  if (period === 'annual')   return n;
  if (period === 'one_time') return n;
  return n;
}

/** Format a number as a compact USD string */
function fmt(n, compact = false) {
  const num = Number(n);
  if (!isFinite(num)) return '$0.00';
  if (compact && num >= 1000) return `$${(num / 1000).toFixed(1)}k`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Chart tooltips ─────────────────────────────────────────────────────────

function CustomPieTooltip({ active, payload }) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{name}</p>
      <p className="text-white font-black">{fmt(value)}<span className="text-gray-500 font-normal">{t('transparency.charts.per_month')}</span></p>
    </div>
  );
}

function CustomBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{label}</p>
      <p className="text-white font-black">{fmt(payload[0].value)}</p>
    </div>
  );
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── UI sub-components ──────────────────────────────────────────────────────

/**
 * KPI stat card shown at the top of the portal.
 * @param {Object} props
 * @param {React.ElementType} props.icon - Lucide icon component
 * @param {string} props.label - Card title
 * @param {string|number} props.value - Main value displayed
 * @param {string} [props.sub] - Secondary line
 * @param {string} [props.accent] - Tailwind text color class
 * @param {boolean} [props.glow] - Whether to render a primary glow shadow
 */
function StatCard({ icon: Icon, label, value, sub, accent = 'text-primary', glow }) {
  return (
    <div
      data-testid="stat-card"
      className={`relative rounded-2xl border border-white/8 bg-white/3 p-5 flex flex-col gap-1 overflow-hidden ${glow ? 'shadow-lg shadow-primary/5' : ''}`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${glow ? 'bg-primary/10' : 'bg-white/5'}`}>
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</p>
      <p className="text-2xl font-black text-white leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * Horizontal bar representing a single expense category weight.
 */
function CategoryBar({ catKey, monthly, totalMonthly, count }) {
  const { t } = useTranslation();
  const style = CATEGORY_STYLE[catKey] || CATEGORY_STYLE.misc;
  const Icon = CATEGORY_ICONS[catKey] || Package;
  const pct = totalMonthly > 0 ? (monthly / totalMonthly) * 100 : 0;
  return (
    <div className="space-y-1.5" data-testid="category-bar">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: style.color + '20' }}>
            <Icon className="w-3 h-3" style={{ color: style.color }} />
          </span>
          <span className="font-bold text-gray-300">{t(`transparency.category.${catKey}`, catKey)}</span>
          <span className="text-gray-600 text-[10px]">{count}x</span>
        </div>
        <span className="font-black text-white">{fmt(monthly)}<span className="text-gray-600 text-[10px] ml-0.5">{t('transparency.charts.per_month')}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: style.color }} />
      </div>
    </div>
  );
}

/**
 * Card for a single income / sponsorship entry.
 * Renders an image preview when available.
 */
function IncomeCard({ entry }) {
  const { t } = useTranslation();
  const incomeMeta = INCOME_STYLE[entry.incomeCategory] || INCOME_STYLE.other;
  const periodKey = entry.period in { daily: 1, monthly: 1, annual: 1, one_time: 1 } ? entry.period : 'monthly';

  return (
    <div
      data-testid="income-card"
      className="rounded-2xl border border-emerald-500/15 bg-emerald-950/20 overflow-hidden flex flex-col"
    >
      {entry.imageUrl ? (
        <div className="w-full bg-black/20 overflow-hidden" style={{ aspectRatio: '16/7' }}>
          <img
            src={entry.imageUrl}
            alt={entry.name}
            className="w-full h-full object-cover"
            onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-emerald-950/30 border-b border-emerald-500/10" style={{ height: 56 }}>
          <ImageIcon className="w-6 h-6 text-emerald-900" aria-hidden="true" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-black text-white leading-tight">{entry.name}</p>
          <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full ${incomeMeta.bg} ${incomeMeta.tw} uppercase tracking-wider`}>
            {t(`transparency.income_category.${entry.incomeCategory}`, entry.incomeCategory)}
          </span>
        </div>
        {entry.description && <p className="text-[11px] text-gray-500">{entry.description}</p>}
        {entry.provider && (
          entry.providerUrl
            ? <a href={entry.providerUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-semibold">
                {entry.provider} <ArrowUpRight className="w-3 h-3" />
              </a>
            : <p className="text-xs text-gray-500 font-semibold">{entry.provider}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-sm font-black text-emerald-300">
            {fmt(entry.amountUsd)}
            <span className="text-[11px] text-gray-500 ml-1">/{t(`transparency.period.${periodKey}`)}</span>
          </span>
          {entry.isPaid
            ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t('transparency.status.received')}</span>
            : <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{t('transparency.status.pending')}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Single expense row inside the full breakdown table.
 */
function EntryRow({ entry }) {
  const { t } = useTranslation();
  const style = CATEGORY_STYLE[entry.category] || CATEGORY_STYLE.misc;
  const Icon = CATEGORY_ICONS[entry.category] || Package;
  const periodKey = entry.period in { daily: 1, monthly: 1, annual: 1, one_time: 1 } ? entry.period : 'monthly';

  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors" data-testid="entry-row">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-xl ${style.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${style.tw}`} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{entry.name}</p>
            {entry.description && <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{entry.description}</p>}
          </div>
        </div>
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        {entry.provider ? (
          entry.providerUrl
            ? <a href={entry.providerUrl} target="_blank" rel="noopener noreferrer" className={`text-xs font-semibold ${style.tw} hover:underline flex items-center gap-1`}>
                {entry.provider} <ExternalLink className="w-3 h-3" />
              </a>
            : <span className={`text-xs font-semibold ${style.tw}`}>{entry.provider}</span>
        ) : <span className="text-xs text-gray-700">&#8212;</span>}
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <span className="text-sm font-black text-white">{fmt(entry.amountUsd)}</span>
        <span className="text-[11px] text-gray-600 ml-1">/{t(`transparency.period.${periodKey}`)}</span>
      </td>
      <td className="py-3 px-4 text-right">
        {entry.isPaid
          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> {t('transparency.status.paid')}
            </span>
          : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" aria-hidden="true" /> {t('transparency.status.pending')}
            </span>}
      </td>
    </tr>
  );
}

/**
 * Investment wallet section showing on-chain POL balance via public RPC.
 * Balance fetch is non-blocking — errors silently show "Unavailable".
 */
function InvestmentWallet() {
  const { t } = useTranslation();
  const [polBalance, setPolBalance] = useState(null);
  const [loadingBal, setLoadingBal] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchBalance = useCallback(async () => {
    setLoadingBal(true);
    try {
      const res = await fetch(POLYGON_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [INVESTMENT_WALLET, 'latest'] }),
      });
      if (!res.ok) throw new Error('RPC error');
      const data = await res.json();
      if (data.result) setPolBalance(Number(BigInt(data.result)) / 1e18);
      else setPolBalance(null);
    } catch {
      setPolBalance(null);
    } finally {
      setLoadingBal(false);
    }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const handleCopy = () => {
    navigator.clipboard.writeText(INVESTMENT_WALLET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 to-slate-900/50 overflow-hidden" data-testid="investment-wallet">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-emerald-500/10 bg-emerald-500/5">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-black text-white">{t('transparency.wallet.title')}</p>
          <p className="text-[10px] text-gray-500">{t('transparency.wallet.subtitle')}</p>
        </div>
        <button
          onClick={fetchBalance}
          aria-label="Refresh balance"
          className="ml-auto p-2 rounded-xl hover:bg-white/5 text-gray-500 hover:text-emerald-400 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingBal ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3 bg-black/30 rounded-xl px-4 py-3">
          <code className="text-xs text-gray-300 font-mono break-all flex-1 select-all" aria-label="Wallet address">
            {INVESTMENT_WALLET}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/10 text-gray-400 hover:text-emerald-400 text-[11px] font-bold transition-colors"
            aria-label={copied ? 'Copied' : 'Copy address'}
          >
            {copied ? <CheckIcon className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{t('transparency.wallet.native_balance')}</p>
            {loadingBal
              ? <div className="h-7 w-32 bg-white/5 rounded-lg animate-pulse" aria-label="Loading balance" />
              : polBalance !== null
                ? <p className="text-2xl font-black text-white" data-testid="pol-balance">
                    {polBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    <span className="text-base text-emerald-400 ml-2">POL</span>
                  </p>
                : <p className="text-sm text-gray-600">{t('transparency.wallet.unavailable')}</p>
            }
          </div>
          <div className="flex gap-2 ml-auto flex-wrap">
            <a href={`https://debank.com/profile/${INVESTMENT_WALLET}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 text-xs font-bold transition-colors">
              <ExternalLink className="w-3 h-3" aria-hidden="true" /> {t('transparency.wallet.debank')}
            </a>
            <a href={`https://polygonscan.com/address/${INVESTMENT_WALLET}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-purple-400 text-xs font-bold transition-colors">
              <ExternalLink className="w-3 h-3" aria-hidden="true" /> {t('transparency.wallet.polygonscan')}
            </a>
          </div>
        </div>
        {POOL_POSITIONS.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3 text-emerald-400" aria-hidden="true" /> {t('transparency.wallet.active_pools')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {POOL_POSITIONS.map(pos => (
                <a key={pos.id} href={pos.link} target="_blank" rel="noopener noreferrer"
                  className="block rounded-2xl overflow-hidden border border-white/8 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 group"
                  aria-label={pos.label}>
                  <img
                    src={`https://opengraph.krystal.app/api/og/strategy?id=${pos.id}`}
                    alt={pos.label}
                    className="w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    style={{ aspectRatio: '1200/628' }}
                    onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page component ─────────────────────────────────────────────────────

/**
 * Public transparency portal page.
 * Displays all active expense/income entries with charts, KPI cards and
 * the on-chain investment wallet snapshot.
 *
 * All user-visible strings are internationalised via react-i18next.
 * Renders an in-page error state when the API call fails, and per-image
 * onError handlers prevent broken-image UI glitches.
 */
export default function Transparency() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transparency')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        if (d.ok) setEntries(d.entries);
        else setErr(t('transparency.loading_error'));
      })
      .catch(() => {
        if (!cancelled) setErr(t('transparency.connection_error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  // ── Derived data ────────────────────────────────────────────────────────
  const expenses = entries.filter(e => !e.type || e.type === 'expense');
  const incomes  = entries.filter(e => e.type === 'income');

  const expRecurring    = expenses.filter(e => e.period !== 'one_time');
  const expOneTime      = expenses.filter(e => e.period === 'one_time');
  const totalMonthly    = expRecurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const totalAnnual     = expRecurring.reduce((s, e) => s + toAnnual(e.amountUsd, e.period), 0)
                        + expOneTime.reduce((s, e) => s + parseFloat(e.amountUsd), 0);
  const incRecurring    = incomes.filter(e => e.period !== 'one_time');
  const totalIncMonthly = incRecurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const netBalance      = totalIncMonthly - totalMonthly;
  const netPositive     = netBalance >= 0;
  const paidUp          = expenses.filter(e => e.isPaid).length;
  const pending         = expenses.filter(e => !e.isPaid).length;

  const byCategory = {};
  for (const e of expenses) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }

  const pieData = CATEGORY_ORDER
    .filter(c => byCategory[c])
    .map(c => ({
      name: t(`transparency.category.${c}`, c),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const barData = CATEGORY_ORDER
    .filter(c => byCategory[c])
    .map(c => ({
      cat: t(`transparency.category.${c}`, c).slice(0, 6),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const lastUpdated = entries.length > 0
    ? new Date(Math.max(...entries.map(e => new Date(e.updatedAt))))
        .toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="space-y-8 max-w-5xl mx-auto" data-testid="transparency-page">
      {/* ── Hero banner ───────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden border border-white/8 bg-gradient-to-br from-slate-900 via-slate-900 to-primary/5 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                <Eye className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tight leading-none">
                  {t('transparency.page_title')}
                </h1>
                <p className="text-[11px] text-gray-500 mt-0.5">{t('transparency.page_subtitle')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 max-w-lg">{t('transparency.page_description')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <div>
              <p className="text-xs font-black text-white">{t('transparency.badge_title')}</p>
              {lastUpdated && <p className="text-[10px] text-gray-600">{t('transparency.badge_updated', { date: lastUpdated })}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Loading spinner ───────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-24" role="status" aria-label="Loading">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── API error ─────────────────────────────────────────────────── */}
      {err && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center text-red-400 text-sm flex items-center justify-center gap-2"
          data-testid="transparency-error"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {err}
        </div>
      )}

      {!loading && !err && (
        <>
          {/* ── KPI Cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-grid">
            <StatCard
              icon={DollarSign}
              label={t('transparency.kpi.monthly_cost')}
              value={fmt(totalMonthly, true)}
              sub={t('transparency.kpi.monthly_cost_sub')}
              accent="text-primary"
              glow
            />
            <StatCard
              icon={TrendingUp}
              label={t('transparency.kpi.total_income')}
              value={fmt(totalIncMonthly, true)}
              sub={t('transparency.kpi.total_income_sub')}
              accent="text-emerald-400"
            />
            <StatCard
              icon={Activity}
              label={t('transparency.kpi.net_balance')}
              value={fmt(Math.abs(netBalance), true)}
              sub={netPositive ? t('transparency.kpi.net_positive') : t('transparency.kpi.net_deficit')}
              accent={netPositive ? 'text-emerald-400' : 'text-red-400'}
            />
            <StatCard
              icon={CheckCircle2}
              label={t('transparency.kpi.annual_cost')}
              value={fmt(totalAnnual, true)}
              sub={t('transparency.kpi.annual_cost_sub', { paid: paidUp, pending })}
              accent="text-amber-400"
            />
          </div>

          {/* ── Recharts: Donut + Bar ──────────────────────────────────── */}
          {pieData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Donut */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" aria-hidden="true" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    {t('transparency.charts.monthly_distribution')}
                  </p>
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                  <div style={{ width: 200, height: 180, flexShrink: 0 }} aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" labelLine={false} label={PieLabel}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
                        </Pie>
                        <RTooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2 text-xs flex-1">
                    {pieData.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} aria-hidden="true" />
                        <span className="text-gray-400">{d.name}</span>
                        <span className="text-white font-black ml-auto">{fmt(d.value, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bar */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    {t('transparency.charts.cost_by_category')}
                  </p>
                </div>
                <div aria-hidden="true">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={barData} barSize={28} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="cat" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, true)} />
                      <RTooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ── Horizontal category bars ───────────────────────────────── */}
          {Object.keys(byCategory).length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-5">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-primary" aria-hidden="true" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {t('transparency.charts.weight_by_category')}
                </p>
                <span className="ml-auto text-[10px] text-gray-600">
                  {t('transparency.charts.total_monthly', { total: fmt(totalMonthly) })}
                </span>
              </div>
              <div className="space-y-4">
                {CATEGORY_ORDER.filter(c => byCategory[c]).map(c => (
                  <CategoryBar
                    key={c}
                    catKey={c}
                    monthly={byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0)}
                    totalMonthly={totalMonthly}
                    count={byCategory[c].length}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Income / Revenue / Sponsorships ───────────────────────── */}
          {incomes.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 overflow-hidden" data-testid="income-section">
              <div className="px-6 py-4 border-b border-emerald-500/10 bg-emerald-500/5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                  {t('transparency.income_section.title')}
                </p>
                <span className="ml-auto text-xs font-black text-emerald-300">
                  {fmt(totalIncMonthly, true)}<span className="text-gray-600 font-normal">{t('transparency.income_section.per_month')}</span>
                </span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {incomes.map(e => <IncomeCard key={e.id} entry={e} />)}
                </div>
              </div>
            </div>
          )}

          {/* ── Investment wallet ──────────────────────────────────────── */}
          <InvestmentWallet />

          {/* ── Full expense breakdown ─────────────────────────────────── */}
          {expenses.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-white/2 p-10 text-center text-gray-500 text-sm">
              {t('transparency.no_entries')}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 overflow-hidden" data-testid="expense-table">
              <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-gray-500" aria-hidden="true" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {t('transparency.table.title')}
                </p>
              </div>
              {CATEGORY_ORDER.filter(c => byCategory[c]).map(cat => {
                const style = CATEGORY_STYLE[cat] || CATEGORY_STYLE.misc;
                const Icon = CATEGORY_ICONS[cat] || Package;
                const catTotal = byCategory[cat].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
                return (
                  <div key={cat}>
                    <div className={`px-4 py-2.5 flex items-center gap-2 ${style.bg} border-b border-white/[0.04]`}>
                      <Icon className={`w-3.5 h-3.5 ${style.tw}`} aria-hidden="true" />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${style.tw}`}>
                        {t(`transparency.category.${cat}`, cat)}
                      </span>
                      <span className="ml-auto text-[10px] text-gray-600">
                        {fmt(catTotal)}{t('transparency.charts.per_month')}
                      </span>
                    </div>
                    <table className="w-full" aria-label={t(`transparency.category.${cat}`)}>
                      <tbody>
                        {byCategory[cat].map(e => <EntryRow key={e.id} entry={e} />)}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-gray-600 text-center pb-4">
            {t('transparency.footer_note')}
          </p>
        </>
      )}
    </div>
  );
}
