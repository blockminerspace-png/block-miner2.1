import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import {
  Eye, Server, Wrench, Megaphone, Briefcase, Scale, Package,
  DollarSign, ExternalLink, TrendingUp, TrendingDown,
  CheckCircle2, Clock, Wallet, Copy, Check as CheckIcon, ShieldCheck,
  BarChart2, Activity, ArrowUpRight, ImageIcon, AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────────────

const INVESTMENT_WALLET_ADDRESS = '0x454d8a4261155621f603a275bb69b381d0513202';
const OLD_DEPOSIT_WALLET_ADDRESS  = '0x1CA03755C5132e238aE4E0f50d4929EA0D58b897';

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

const CATEGORY_ORDER = ['infrastructure', 'tooling', 'marketing', 'payroll', 'legal', 'misc'] as const;

type CategoryKey = keyof typeof CATEGORY_ICONS;

export interface TransparencyEntry {
  id: number;
  type?: string;
  category: string;
  incomeCategory?: string | null;
  name: string;
  description?: string | null;
  provider?: string | null;
  providerUrl?: string | null;
  imageUrl?: string | null;
  amountUsd: string | number;
  period: string;
  isPaid: boolean;
  isActive?: boolean;
  updatedAt: string;
  sortOrder?: number;
  amountOriginal?: number | string | null;
  currencyCode?: string | null;
  fxRateUsd?: number | string | null;
  isOnChain?: boolean;
  walletAddress?: string | null;
  txHash?: string | null;
  blockchain?: string | null;
  direction?: string | null;
}

export interface TokenHolding {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  usdValue: number | null;
}

export interface ChainSnapshotEntry {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeUsd: number | null;
  tokens: TokenHolding[];
  totalChainUsd: number | null;
}

export interface NftHoldingEntry {
  contractAddress: string;
  tokenId: string;
  contractName: string;
  tokenSymbol: string;
  standard: string;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  tokenUri: string | null;
  explorerUrl: string;
  openseaUrl: string;
  chainName?: string;
  chainId?: number;
  isLiquidityPosition?: boolean;
  liquidityUsd?: number | null;
  poolLabel?: string | null;
}

export interface LiquidityPoolEntry {
  id?: string | number;
  chainId: number;
  chainName: string;
  contractAddress: string;
  tokenId: string;
  poolLabel?: string | null;
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  tokenUri?: string | null;
  explorerUrl: string;
  openseaUrl: string;
  liquidityUsd?: number | null;
  status: string;
  lastSeenAt?: string;
  closedAt?: string | null;
}

export interface TrackedWalletEntry {
  id?: string | number;
  address: string;
  label?: string | null;
  explorerBaseUrl?: string | null;
  chain?: string | null;
  assetSymbol?: string | null;
  displayMode?: string | null;
  isActive?: boolean;
  valuePol?: number | null;
  valueUsd?: number | null;
  tokens?: TokenHolding[];
  nfts?: NftHoldingEntry[];
  liquidityPools?: LiquidityPoolEntry[];
  chains?: ChainSnapshotEntry[];
  fetchedAt?: string;
}

interface TransparencyApiResponse {
  ok: boolean;
  entries?: TransparencyEntry[];
  trackedWallet?: string | null;
  trackedWallets?: TrackedWalletEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert any period amount to a monthly equivalent */
function toMonthly(amount: string | number, period: string): number {
  const n = parseFloat(String(amount));
  if (period === 'daily')    return n * 30;
  if (period === 'monthly')  return n;
  if (period === 'annual')   return n / 12;
  return 0; // one_time excluded from monthly
}

/** Convert any period amount to an annual equivalent */
function toAnnual(amount: string | number, period: string): number {
  const n = parseFloat(String(amount));
  if (period === 'daily')    return n * 365;
  if (period === 'monthly')  return n * 12;
  if (period === 'annual')   return n;
  if (period === 'one_time') return n;
  return n;
}

/** Format a number as a compact USD string */
function fmt(n: unknown, compact = false): string {
  const num = Number(n);
  if (!isFinite(num)) return '$0.00';
  if (compact && num >= 1000) return `$${(num / 1000).toFixed(1)}k`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMaybe(n: unknown, digits = 2): string | null {
  const num = Number(n);
  if (!isFinite(num)) return null;
  return num.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// ─── Chart tooltips ─────────────────────────────────────────────────────────
/** Narrowed props from Recharts <Tooltip content={...} /> (library uses chart-wide generics). */
interface RechartsTooltipPayloadEntry {
  name?: string;
  value?: number | string;
}

function CustomPieTooltip(props: unknown) {
  const { active, payload } = props as {
    active?: boolean;
    payload?: readonly RechartsTooltipPayloadEntry[];
  };
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const num = typeof value === 'number' ? value : Number(value);
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{name}</p>
      <p className="text-white font-black">{fmt(num)}<span className="text-gray-500 font-normal">{t('transparency.charts.per_month')}</span></p>
    </div>
  );
}

function CustomBarTooltip(props: unknown) {
  const { active, payload, label } = props as {
    active?: boolean;
    payload?: readonly RechartsTooltipPayloadEntry[];
    label?: string | number;
  };
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const num = typeof v === 'number' ? v : Number(v);
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{label}</p>
      <p className="text-white font-black">{fmt(num)}</p>
    </div>
  );
}

function PieLabel(props: PieLabelRenderProps) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
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
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'text-primary',
  glow = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  glow?: boolean;
}) {
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
function CategoryBar({
  catKey,
  monthly,
  totalMonthly,
  count,
}: {
  catKey: string;
  monthly: number;
  totalMonthly: number;
  count: number;
}) {
  const { t } = useTranslation();
  const style = CATEGORY_STYLE[catKey as CategoryKey] || CATEGORY_STYLE.misc;
  const Icon = CATEGORY_ICONS[catKey as CategoryKey] || Package;
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
function IncomeCard({ entry }: { entry: TransparencyEntry }) {
  const { t } = useTranslation();
  type IncomeKey = keyof typeof INCOME_STYLE;
  const rawIc = entry.incomeCategory;
  const incomeMeta =
    rawIc && rawIc in INCOME_STYLE ? INCOME_STYLE[rawIc as IncomeKey] : INCOME_STYLE.other;
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
            onError={(e: SyntheticEvent<HTMLImageElement>) => {
              const parent = e.currentTarget.parentElement;
              if (parent) parent.style.display = 'none';
            }}
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
            {t(`transparency.income_category.${entry.incomeCategory ?? 'other'}`, entry.incomeCategory ?? 'other')}
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
          <div>
            <span className="text-sm font-black text-emerald-300">
              {fmt(entry.amountUsd)}
              <span className="text-[11px] text-gray-500 ml-1">/{t(`transparency.period.${periodKey}`)}</span>
            </span>
            {entry.amountOriginal != null ? (
              <p className="text-[10px] text-gray-500 mt-0.5">
                {Number(entry.amountOriginal).toLocaleString('en-US', { maximumFractionDigits: 8 })} {entry.currencyCode || 'USD'}
                {entry.fxRateUsd ? ` · fx ${fmtMaybe(entry.fxRateUsd, 4)}` : ''}
              </p>
            ) : null}
          </div>
          {entry.isPaid
            ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t('transparency.status.received')}</span>
            : <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{t('transparency.status.pending')}</span>}
        </div>
        {entry.isOnChain && (entry.walletAddress || entry.txHash) ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {entry.walletAddress ? (
              <a
                href={`https://polygonscan.com/address/${entry.walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300"
              >
                Carteira <ExternalLink className="w-3 h-3" />
              </a>
            ) : null}
            {entry.txHash ? (
              <a
                href={`https://polygonscan.com/tx/${entry.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-1 text-[10px] font-bold text-purple-300"
              >
                Tx <ExternalLink className="w-3 h-3" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Single expense row inside the full breakdown table.
 */
function EntryRow({ entry }: { entry: TransparencyEntry }) {
  const { t } = useTranslation();
  const style = CATEGORY_STYLE[entry.category as CategoryKey] || CATEGORY_STYLE.misc;
  const Icon = CATEGORY_ICONS[entry.category as CategoryKey] || Package;
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
        <div>
          <span className="text-sm font-black text-white">{fmt(entry.amountUsd)}</span>
          <span className="text-[11px] text-gray-600 ml-1">/{t(`transparency.period.${periodKey}`)}</span>
          {entry.amountOriginal != null ? (
            <div className="text-[10px] text-gray-600 mt-0.5">
              {Number(entry.amountOriginal).toLocaleString('en-US', { maximumFractionDigits: 8 })} {entry.currencyCode || 'USD'}
            </div>
          ) : null}
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex flex-col items-end gap-1">
          {entry.isPaid
            ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> {t('transparency.status.paid')}
              </span>
            : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" aria-hidden="true" /> {t('transparency.status.pending')}
              </span>}
          {entry.isOnChain ? (
            <span className="text-[10px] font-bold text-sky-300">
              {entry.blockchain || 'polygon'}{entry.direction ? ` · ${entry.direction}` : ''}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

interface WalletsLiveResponse {
  ok: boolean;
  warming?: boolean;
  polUsdPrice?: number | null;
  wallets?: TrackedWalletEntry[];
}

const DISPLAY_MODE_CONFIG = {
  total_received: {
    label: 'Total Received',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-950/10',
    headerBg: 'bg-emerald-500/5',
    headerBorder: 'border-emerald-500/10',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    valueBadge: 'text-emerald-400',
    chainBadge: 'bg-emerald-500/10 text-emerald-300',
  },
  current_balance: {
    label: 'Current Balance',
    border: 'border-violet-500/20',
    bg: 'bg-violet-950/10',
    headerBg: 'bg-violet-500/5',
    headerBorder: 'border-violet-500/10',
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-400',
    valueBadge: 'text-violet-400',
    chainBadge: 'bg-violet-500/10 text-violet-300',
  },
  total_sent: {
    label: 'Total Sent',
    border: 'border-sky-500/20',
    bg: 'bg-sky-950/10',
    headerBg: 'bg-sky-500/5',
    headerBorder: 'border-sky-500/10',
    iconBg: 'bg-sky-500/15',
    iconColor: 'text-sky-400',
    valueBadge: 'text-sky-400',
    chainBadge: 'bg-sky-500/10 text-sky-300',
  },
} as const;

type DisplayModeKey = keyof typeof DISPLAY_MODE_CONFIG;

function WalletCard({ wallet, loading }: { wallet: TrackedWalletEntry; loading: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const mode = (wallet.displayMode ?? 'total_received') as DisplayModeKey;
  const cfg = DISPLAY_MODE_CONFIG[mode] ?? DISPLAY_MODE_CONFIG.total_received;
  const modeLabel = t(`transparency.wallets.mode_${mode}`, cfg.label);
  const explorerUrl = `${wallet.explorerBaseUrl || 'https://polygonscan.com/address'}/${wallet.address}`;
  const isInvestment = wallet.address.toLowerCase() === INVESTMENT_WALLET_ADDRESS.toLowerCase();
  const isDeprecated =
    wallet.isActive === false ||
    wallet.address.toLowerCase() === OLD_DEPOSIT_WALLET_ADDRESS.toLowerCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className={`rounded-2xl border ${isDeprecated ? 'border-red-500/40' : cfg.border} ${isDeprecated ? 'bg-red-950/10' : cfg.bg} overflow-hidden`}>
      <div className={`flex items-center gap-3 px-5 py-3.5 border-b ${isDeprecated ? 'border-red-500/20 bg-red-500/5' : `${cfg.headerBorder} ${cfg.headerBg}`}`}>
        <div className={`w-8 h-8 rounded-xl ${isDeprecated ? 'bg-red-500/15' : cfg.iconBg} flex items-center justify-center shrink-0`}>
          <Wallet className={`w-4 h-4 ${isDeprecated ? 'text-red-400' : cfg.iconColor}`} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white leading-tight truncate">{wallet.label || t('transparency.wallets.label_fallback')}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${isDeprecated ? 'text-red-400' : cfg.iconColor}`}>{modeLabel}</p>
        </div>
        {isDeprecated && (
          <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
            {t('transparency.wallets.deprecated_badge')}
          </span>
        )}
        {!isDeprecated && wallet.isActive === false && (
          <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 uppercase tracking-wider">{t('transparency.wallets.inactive_badge')}</span>
        )}
      </div>

      {isDeprecated && (
        <div className="mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-xs font-black text-red-300 uppercase tracking-wider mb-0.5">{t('transparency.wallets.deprecated_badge')}</p>
            <p className="text-[11px] text-red-300/70 leading-relaxed">{t('transparency.wallets.deprecated_description')}</p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
          <code className="text-[11px] text-gray-400 font-mono break-all flex-1 select-all">{wallet.address}</code>
          <button
            onClick={handleCopy}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label={copied ? t('transparency.wallets.copied') : t('transparency.wallets.copy_address')}
          >
            {copied ? <CheckIcon className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className={`rounded-xl border ${isDeprecated ? 'border-red-500/15' : 'border-white/8'} bg-black/20 p-4`}>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
            {modeLabel} · {mode === 'current_balance' && wallet.chains && wallet.chains.length > 1 ? t('transparency.wallets.multi_chain') : 'Polygon'}
            {mode === 'current_balance' && wallet.fetchedAt && (
              <span className="ml-2 text-gray-700 normal-case tracking-normal font-normal">
                · {t('transparency.wallets.updated')} {new Date(wallet.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
          {loading
            ? <div className="h-8 w-40 bg-white/5 rounded-lg animate-pulse" />
            : mode === 'current_balance'
              ? <>
                  {wallet.valueUsd != null
                    ? <>
                        <p className="text-2xl font-black text-white">
                          ${wallet.valueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-sm text-gray-500 ml-2">USD</span>
                        </p>
                        {wallet.valuePol != null && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {wallet.valuePol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {t('transparency.wallets.pol_liquid')}
                          </p>
                        )}
                      </>
                    : <p className="text-sm text-gray-600">{t('transparency.wallets.unavailable')}</p>
                  }
                </>
              : wallet.valueUsd != null || wallet.valuePol != null
                ? <>
                    {wallet.valueUsd != null
                      ? <p className="text-2xl font-black text-white">
                          ${wallet.valueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-sm text-gray-500 ml-2">USD</span>
                        </p>
                      : null
                    }
                    {wallet.valuePol != null && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {wallet.valuePol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        <span className={`ml-1 ${cfg.valueBadge}`}>{wallet.assetSymbol || 'POL'}</span>
                      </p>
                    )}
                  </>
                : <p className="text-sm text-gray-600">{t('transparency.wallets.unavailable')}</p>
          }
        </div>

        {!loading && mode === 'current_balance' && wallet.chains && wallet.chains.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3 text-amber-400" aria-hidden="true" />
              {t('transparency.wallets.chains_breakdown')}
            </p>
            {wallet.chains.map(c => (
              <div key={c.chainId} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black text-white bg-white/8 rounded px-1.5 py-0.5 shrink-0 uppercase">{c.name}</span>
                  <span className="text-[10px] text-gray-500">
                    {c.nativeBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {c.nativeSymbol}
                  </span>
                  {c.tokens.length > 0 && (
                    <span className="text-[9px] text-gray-700">+{c.tokens.length} token{c.tokens.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <span className="text-[11px] font-black text-white shrink-0">
                  {c.totalChainUsd != null
                    ? `$${c.totalChainUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 ${isDeprecated ? 'bg-red-500/10 text-red-400' : cfg.chainBadge}`}>
            {wallet.chain || 'polygon'}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 bg-white/5 text-slate-400">
            {wallet.assetSymbol || 'POL'}
          </span>
          {isInvestment && (
            <a
              href={`https://debank.com/profile/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              DeBank <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function LiquidityPoolsPanel({ wallets }: { wallets: TrackedWalletEntry[] }) {
  const { t } = useTranslation();

  // Only active pools — grouped by chain
  const pools = wallets
    .flatMap((w) => (w.liquidityPools ?? []).filter((p) => p.status === 'active').map((p) => ({ ...p, walletAddress: w.address })));

  const grouped = pools.reduce<Record<string, Array<LiquidityPoolEntry & { walletAddress: string }>>>((acc, p) => {
    const key = (p.chainName || 'unknown').toUpperCase();
    acc[key] ||= [];
    acc[key].push(p);
    return acc;
  }, {});

  if (pools.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-violet-400" aria-hidden="true" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            {t('transparency.wallets.tab_liquidity_pools')}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/2 px-4 py-8 text-center text-sm text-gray-500">
          {t('transparency.wallets.no_liquidity_pools')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-violet-400" aria-hidden="true" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
          {t('transparency.wallets.tab_liquidity_pools')}
        </p>
      </div>
      <div className="space-y-5">
        {Object.entries(grouped).map(([chainName, chainPools]) => (
          <div key={chainName} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 bg-emerald-500/10 text-emerald-300">
                {chainName}
              </span>
              <span className="text-[10px] text-gray-500">
                {chainPools.length} pool{chainPools.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {chainPools.map((nft) => (
                <a
                  key={`${nft.contractAddress}:${nft.tokenId}`}
                  href={nft.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="overflow-hidden rounded-3xl border border-emerald-500/15 bg-gradient-to-b from-emerald-950/20 to-slate-950/40 hover:border-emerald-500/30 shadow-lg shadow-emerald-950/10 transition-colors group"
                >
                  <div className="p-3 pb-0">
                    {nft.imageUrl ? (
                      <div className="w-full overflow-hidden rounded-2xl border border-white/8 bg-black/20 flex items-center justify-center" style={{ minHeight: 320 }}>
                        <div className="h-full w-full max-w-[220px] flex items-center justify-center" style={{ aspectRatio: '10 / 16' }}>
                          <img
                            src={nft.imageUrl}
                            alt={nft.name || nft.poolLabel || `LP NFT #${nft.tokenId}`}
                            className="max-w-full max-h-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.02]"
                            onError={(e: SyntheticEvent<HTMLImageElement>) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) parent.style.display = 'none';
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-violet-950/20" style={{ minHeight: 320 }}>
                        <div className="h-full w-full max-w-[220px] flex items-center justify-center" style={{ aspectRatio: '10 / 16' }}>
                          <ImageIcon className="w-10 h-10 text-violet-900" aria-hidden="true" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 pt-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-1 bg-emerald-500/10 text-emerald-300">
                          {t('transparency.wallets.active_pools')}
                        </span>
                        <p className="text-base font-black text-violet-100 truncate mt-1">
                          {nft.poolLabel || nft.name || `LP NFT #${nft.tokenId}`}
                        </p>
                        <p className="text-[11px] text-violet-200/60 truncate mt-0.5">
                          NFT #{nft.tokenId}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-violet-500 group-hover:text-violet-300 shrink-0 mt-0.5" aria-hidden="true" />
                    </div>
                    {nft.liquidityUsd != null && (
                      <p className="text-lg font-black text-white">
                        ${nft.liquidityUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                    <div className="rounded-xl bg-black/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-widest text-violet-200/40 mb-1">Wallet</p>
                      <p className="text-[11px] text-violet-200/55 truncate font-mono">{nft.walletAddress}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const WALLETS_POLL_INTERVAL_MS = 12_000;
const WALLETS_MAX_RETRIES = 10;

function WalletsLiveSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<WalletsLiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [warming, setWarming] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'liquidity_pools' | 'bot_sport'>('overview');

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    const fetchWallets = async () => {
      try {
        const res = await fetch('/api/transparency/wallets-live');
        if (cancelled || !res.ok) return;
        const json: WalletsLiveResponse = await res.json();
        if (!json.ok) return;

        if (json.warming || !json.wallets?.length) {
          // Server cache is still warming — show indicator and schedule retry
          setWarming(true);
          setLoading(false);
          if (retries < WALLETS_MAX_RETRIES) {
            retries++;
            setTimeout(() => { if (!cancelled) void fetchWallets(); }, WALLETS_POLL_INTERVAL_MS);
          }
          return;
        }

        setWarming(false);
        setData(json);
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchWallets();
    return () => { cancelled = true; };
  }, []);

  const wallets = data?.wallets ?? [];
  const activeWallets = wallets.filter(w => w.isActive !== false);
  const legacyWallets = wallets.filter(w => w.isActive === false);
  const showSection = loading || warming || wallets.length > 0;
  if (!showSection) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ['overview', t('transparency.wallets.tab_overview')],
          ['liquidity_pools', t('transparency.wallets.tab_liquidity_pools')],
          ['bot_sport', t('transparency.wallets.tab_bot_sport')],
        ] as const).map(([tabKey, label]) => {
          const active = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                active
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'bg-black/20 text-gray-500 border border-white/8 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <>
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('transparency.wallets.section_title')}</p>
        {warming && (
          <span className="ml-2 flex items-center gap-1.5 text-[10px] text-amber-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {t('transparency.wallets.warming')}
          </span>
        )}
        {data?.polUsdPrice != null && (
          <span className="ml-auto text-[10px] text-gray-600">
            1 POL ≈ ${data.polUsdPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USD
          </span>
        )}
      </div>
      {(loading || warming) && !wallets.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl border border-white/8 bg-white/2 h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {activeWallets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeWallets.map(w => (
                <WalletCard key={w.id ?? w.address} wallet={w} loading={loading} />
              ))}
            </div>
          )}

          {legacyWallets.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {t('transparency.wallets.legacy_section_title')}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {legacyWallets.map(w => (
                  <WalletCard key={w.id ?? w.address} wallet={w} loading={loading} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {activeTab === 'liquidity_pools' && !loading && !warming && (
        <LiquidityPoolsPanel wallets={wallets} />
      )}

      {activeTab === 'liquidity_pools' && (loading || warming) && !wallets.length && (
        <div className="rounded-2xl border border-white/8 bg-white/2 h-48 animate-pulse" />
      )}

      {activeTab === 'bot_sport' && (
        <div className="rounded-2xl border border-white/8 bg-white/2 px-4 py-10 text-center">
          <p className="text-sm font-black text-white uppercase tracking-widest">
            {t('transparency.wallets.tab_bot_sport')}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {t('transparency.wallets.coming_soon')}
          </p>
        </div>
      )}
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
  const [entries, setEntries] = useState<TransparencyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transparency')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw: unknown) => {
        if (cancelled) return;
        const d = raw as TransparencyApiResponse;
        if (d.ok) {
          setEntries(d.entries ?? []);
        } else setErr(t('transparency.loading_error'));
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
                        + expOneTime.reduce((s, e) => s + parseFloat(String(e.amountUsd)), 0);
  const incRecurring    = incomes.filter(e => e.period !== 'one_time');
  const totalIncMonthly = incRecurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const netBalance      = totalIncMonthly - totalMonthly;
  const netPositive     = netBalance >= 0;
  const paidUp          = expenses.filter(e => e.isPaid).length;
  const pending         = expenses.filter(e => !e.isPaid).length;

  const byCategory: Record<string, TransparencyEntry[]> = {};
  for (const e of expenses) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }

  const pieData = CATEGORY_ORDER
    .filter((c): c is CategoryKey => Boolean(byCategory[c]))
    .map(c => ({
      name: t(`transparency.category.${c}`, c),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const barData = CATEGORY_ORDER
    .filter((c): c is CategoryKey => Boolean(byCategory[c]))
    .map(c => ({
      cat: t(`transparency.category.${c}`, c).slice(0, 6),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const lastUpdated = entries.length > 0
    ? new Date(Math.max(...entries.map(e => new Date(e.updatedAt).getTime())))
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
                        <RTooltip content={CustomPieTooltip} />
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
                      <RTooltip content={CustomBarTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
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
                {CATEGORY_ORDER.filter((c): c is CategoryKey => Boolean(byCategory[c])).map((c) => (
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

          {/* ── Project wallets (on-chain live data) ──────────────────── */}
          <WalletsLiveSection />

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
              {CATEGORY_ORDER.filter((c): c is CategoryKey => Boolean(byCategory[c])).map((cat) => {
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
