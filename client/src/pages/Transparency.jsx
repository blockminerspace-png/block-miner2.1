import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Eye, Server, Wrench, Megaphone, Briefcase, Scale, Package,
  DollarSign, RefreshCw, ExternalLink, TrendingUp, TrendingDown,
  CheckCircle2, Clock, Wallet, Copy, Check as CheckIcon, ShieldCheck,
  BarChart2, Activity, ArrowUpRight, ImageIcon,
} from 'lucide-react';

const INVESTMENT_WALLET = '0x1f4872991e6bFc74C2064E2fE4875a78503B5cc1';
const POLYGON_RPC = 'https://polygon-rpc.com';

const POOL_POSITIONS = [
  { id: 'XYaDWC63das', label: 'WBTC / USDC — Uniswap V3 (0.05%)', link: 'https://defi.krystal.app' },
];

const CATEGORY_META = {
  infrastructure: { label: 'Infraestrutura', icon: Server,    color: '#60a5fa', tw: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  tooling:        { label: 'Ferramentas',    icon: Wrench,    color: '#c084fc', tw: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  marketing:      { label: 'Marketing',      icon: Megaphone, color: '#f472b6', tw: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/20'   },
  payroll:        { label: 'Equipe',         icon: Briefcase, color: '#fbbf24', tw: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  legal:          { label: 'Juridico',       icon: Scale,     color: '#34d399', tw: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20'},
  misc:           { label: 'Outros',         icon: Package,   color: '#9ca3af', tw: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/20'   },
};

const PERIOD_LABEL = { daily: 'Diario', monthly: 'Mensal', annual: 'Anual', one_time: 'Unico' };
const CATEGORY_ORDER = ['infrastructure', 'tooling', 'marketing', 'payroll', 'legal', 'misc'];

const INCOME_CATEGORY_META = {
  revenue:           { label: 'Receita Operacional', color: '#34d399', bg: 'bg-emerald-500/15',  tw: 'text-emerald-400' },
  sponsorship:       { label: 'Patrocinio',           color: '#60a5fa', bg: 'bg-blue-500/15',    tw: 'text-blue-400'    },
  donation:          { label: 'Doacao',               color: '#f472b6', bg: 'bg-pink-500/15',    tw: 'text-pink-400'    },
  investment_return: { label: 'Retorno Invest.',       color: '#a78bfa', bg: 'bg-violet-500/15',  tw: 'text-violet-400'  },
  other:             { label: 'Outro',                color: '#9ca3af', bg: 'bg-gray-500/15',    tw: 'text-gray-400'    },
};

function toMonthly(amount, period) {
  const n = parseFloat(amount);
  if (period === 'daily')    return n * 30;
  if (period === 'monthly')  return n;
  if (period === 'annual')   return n / 12;
  return 0;
}
function toAnnual(amount, period) {
  const n = parseFloat(amount);
  if (period === 'daily')    return n * 365;
  if (period === 'monthly')  return n * 12;
  if (period === 'annual')   return n;
  if (period === 'one_time') return n;
  return n;
}
function fmt(n, compact = false) {
  if (compact && n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CustomPieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{name}</p>
      <p className="text-white font-black">{fmt(value)}<span className="text-gray-500 font-normal">/mes</span></p>
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

function StatCard({ icon: Icon, label, value, sub, accent = 'text-primary', glow }) {
  return (
    <div className={`relative rounded-2xl border border-white/8 bg-white/3 p-5 flex flex-col gap-1 overflow-hidden ${glow ? 'shadow-lg shadow-primary/5' : ''}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${glow ? 'bg-primary/10' : 'bg-white/5'}`}>
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</p>
      <p className="text-2xl font-black text-white leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function CategoryBar({ meta, monthly, totalMonthly, entries }) {
  const pct = totalMonthly > 0 ? (monthly / totalMonthly) * 100 : 0;
  const Icon = meta.icon;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: meta.color + '20' }}>
            <Icon className="w-3 h-3" style={{ color: meta.color }} />
          </span>
          <span className="font-bold text-gray-300">{meta.label}</span>
          <span className="text-gray-600 text-[10px]">{entries}x</span>
        </div>
        <span className="font-black text-white">{fmt(monthly)}<span className="text-gray-600 text-[10px] ml-0.5">/mes</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: meta.color }} />
      </div>
    </div>
  );
}

function IncomeCard({ entry }) {
  const meta = INCOME_CATEGORY_META[entry.incomeCategory] || INCOME_CATEGORY_META.other;
  return (
    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-950/20 overflow-hidden flex flex-col">
      {entry.imageUrl ? (
        <div className="w-full bg-black/20 overflow-hidden" style={{ aspectRatio: '16/7' }}>
          <img src={entry.imageUrl} alt={entry.name} className="w-full h-full object-cover" onError={e => { e.target.parentElement.style.display='none'; }} />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-emerald-950/30 border-b border-emerald-500/10" style={{ height: 56 }}>
          <ImageIcon className="w-6 h-6 text-emerald-900" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-black text-white leading-tight">{entry.name}</p>
          <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full ${meta.bg} ${meta.tw} uppercase tracking-wider`}>{meta.label}</span>
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
          <span className="text-sm font-black text-emerald-300">{fmt(entry.amountUsd)}<span className="text-[11px] text-gray-500 ml-1">/{(PERIOD_LABEL[entry.period] || entry.period).toLowerCase()}</span></span>
          {entry.isPaid
            ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Recebido</span>
            : <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Pendente</span>}
        </div>
      </div>
    </div>
  );
}

  const meta = CATEGORY_META[entry.category] || CATEGORY_META.misc;
  const Icon = meta.icon;
  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-xl ${meta.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${meta.tw}`} />
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
            ? <a href={entry.providerUrl} target="_blank" rel="noopener noreferrer" className={`text-xs font-semibold ${meta.tw} hover:underline flex items-center gap-1`}>
                {entry.provider} <ExternalLink className="w-3 h-3" />
              </a>
            : <span className={`text-xs font-semibold ${meta.tw}`}>{entry.provider}</span>
        ) : <span className="text-xs text-gray-700">-</span>}
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <span className="text-sm font-black text-white">{fmt(entry.amountUsd)}</span>
        <span className="text-[11px] text-gray-600 ml-1">/{(PERIOD_LABEL[entry.period] || entry.period).toLowerCase()}</span>
      </td>
      <td className="py-3 px-4 text-right">
        {entry.isPaid
          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Pago
            </span>
          : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" /> Pendente
            </span>}
      </td>
    </tr>
  );
}

function InvestmentWallet() {
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
      const data = await res.json();
      if (data.result) setPolBalance(Number(BigInt(data.result)) / 1e18);
    } catch { setPolBalance(null); }
    finally { setLoadingBal(false); }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const handleCopy = () => {
    navigator.clipboard.writeText(INVESTMENT_WALLET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 to-slate-900/50 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-emerald-500/10 bg-emerald-500/5">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-black text-white">Carteira de Investimentos</p>
          <p className="text-[10px] text-gray-500">Polygon Network - Onchain em tempo real</p>
        </div>
        <button onClick={fetchBalance} className="ml-auto p-2 rounded-xl hover:bg-white/5 text-gray-500 hover:text-emerald-400 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingBal ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3 bg-black/30 rounded-xl px-4 py-3">
          <code className="text-xs text-gray-300 font-mono break-all flex-1 select-all">{INVESTMENT_WALLET}</code>
          <button onClick={handleCopy}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/10 text-gray-400 hover:text-emerald-400 text-[11px] font-bold transition-colors">
            {copied ? <CheckIcon className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Saldo Nativo</p>
            {loadingBal
              ? <div className="h-7 w-32 bg-white/5 rounded-lg animate-pulse" />
              : polBalance !== null
                ? <p className="text-2xl font-black text-white">
                    {polBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    <span className="text-base text-emerald-400 ml-2">POL</span>
                  </p>
                : <p className="text-sm text-gray-600">Indisponivel</p>
            }
          </div>
          <div className="flex gap-2 ml-auto flex-wrap">
            <a href={`https://debank.com/profile/${INVESTMENT_WALLET}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 text-xs font-bold transition-colors">
              <ExternalLink className="w-3 h-3" /> DeBank
            </a>
            <a href={`https://polygonscan.com/address/${INVESTMENT_WALLET}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-purple-400 text-xs font-bold transition-colors">
              <ExternalLink className="w-3 h-3" /> Polygonscan
            </a>
          </div>
        </div>
        {POOL_POSITIONS.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3 text-emerald-400" /> Posicoes Ativas nas Pools
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {POOL_POSITIONS.map(pos => (
                <a key={pos.id} href={pos.link} target="_blank" rel="noopener noreferrer"
                  className="block rounded-2xl overflow-hidden border border-white/8 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 group">
                  <img
                    src={`https://opengraph.krystal.app/api/og/strategy?id=${pos.id}`}
                    alt={pos.label}
                    className="w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    style={{ aspectRatio: '1200/628' }}
                    onError={e => { e.target.parentElement.style.display = 'none'; }}
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

export default function Transparency() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch('/api/transparency')
      .then(r => r.json())
      .then(d => { if (d.ok) setEntries(d.entries); else setErr('Nao foi possivel carregar os dados.'); })
      .catch(() => setErr('Erro de conexao.'))
      .finally(() => setLoading(false));
  }, []);

  const recurring = entries.filter(e => e.period !== 'one_time');
  const oneTime   = entries.filter(e => e.period === 'one_time');
  const totalMonthly = recurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const totalAnnual  = recurring.reduce((s, e) => s + toAnnual(e.amountUsd, e.period), 0)
                     + oneTime.reduce((s, e) => s + parseFloat(e.amountUsd), 0);
  const paidUp  = entries.filter(e => e.isPaid).length;
  const pending = entries.filter(e => !e.isPaid).length;

  const byCategory = {};
  for (const e of entries) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }

  const pieData = CATEGORY_ORDER
    .filter(c => byCategory[c])
    .map(c => ({
      name: CATEGORY_META[c]?.label || c,
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_META[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const barData = CATEGORY_ORDER
    .filter(c => byCategory[c])
    .map(c => ({
      cat: (CATEGORY_META[c]?.label || c).slice(0, 6),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_META[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const lastUpdated = entries.length > 0
    ? new Date(Math.max(...entries.map(e => new Date(e.updatedAt))))
        .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden border border-white/8 bg-gradient-to-br from-slate-900 via-slate-900 to-primary/5 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tight leading-none">Portal de Transparencia</h1>
                <p className="text-[11px] text-gray-500 mt-0.5">BlockMiner - Custos operacionais e investimentos</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 max-w-lg">
              Todos os gastos do site abertos a comunidade: infraestrutura, ferramentas, marketing e onde o dinheiro esta investido.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-xs font-black text-white">100% Transparente</p>
              {lastUpdated && <p className="text-[10px] text-gray-600">Atualizado: {lastUpdated}</p>}
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {err && <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center text-red-400 text-sm">{err}</div>}

      {!loading && !err && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={DollarSign}   label="Custo Mensal"      value={fmt(totalMonthly, true)}  sub="Despesas recorrentes"      accent="text-primary"      glow />
            <StatCard icon={TrendingUp}   label="Total Receitas"    value={fmt(totalIncMonthly, true)} sub="Receitas mensais"          accent="text-emerald-400" />
            <StatCard icon={Activity}     label="Saldo Liquido"     value={fmt(Math.abs(netBalance), true)} sub={netPositive ? 'Saldo positivo' : 'Deficit mensal'} accent={netPositive ? 'text-emerald-400' : 'text-red-400'} />
            <StatCard icon={CheckCircle2} label="Anuais (gastos)"   value={fmt(totalAnnual, true)}   sub={`${paidUp} pago(s), ${pending} pendente(s)`} accent="text-amber-400"   />
          </div>

          {/* Charts */}
          {pieData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Donut */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Distribuicao Mensal</p>
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                  <div style={{ width: 200, height: 180, flexShrink: 0 }}>
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
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
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
                  <Activity className="w-4 h-4 text-primary" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Custo por Categoria / Mes</p>
                </div>
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
          )}

          {/* Barras horizontais por categoria */}
          {Object.keys(byCategory).length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-5">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-primary" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Peso por Categoria</p>
                <span className="ml-auto text-[10px] text-gray-600">{fmt(totalMonthly)}/mes no total</span>
              </div>
              <div className="space-y-4">
                {CATEGORY_ORDER.filter(c => byCategory[c]).map(c => (
                  <CategoryBar
                    key={c}
                    meta={CATEGORY_META[c] || CATEGORY_META.misc}
                    monthly={byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0)}
                    totalMonthly={totalMonthly}
                    entries={byCategory[c].length}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Receitas / Patrocinios / Doacoes */}
          {incomes.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-emerald-500/10 bg-emerald-500/5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">Receitas, Patrocinios &amp; Doacoes</p>
                <span className="ml-auto text-xs font-black text-emerald-300">{fmt(totalIncMonthly, true)}<span className="text-gray-600 font-normal">/mes</span></span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {incomes.map(e => <IncomeCard key={e.id} entry={e} />)}
                </div>
              </div>
            </div>
          )}

          {/* Carteira */}
          <InvestmentWallet />

          {/* Tabela */}
          {entries.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-white/2 p-10 text-center text-gray-500 text-sm">
              Nenhuma entrada publicada ainda.
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-gray-500" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Detalhamento Completo</p>
              </div>
              {CATEGORY_ORDER.filter(c => byCategory[c]).map(cat => {
                const meta = CATEGORY_META[cat] || CATEGORY_META.misc;
                const Icon = meta.icon;
                const catTotal = byCategory[cat].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
                return (
                  <div key={cat}>
                    <div className={`px-4 py-2.5 flex items-center gap-2 ${meta.bg} border-b border-white/[0.04]`}>
                      <Icon className={`w-3.5 h-3.5 ${meta.tw}`} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${meta.tw}`}>{meta.label}</span>
                      <span className="ml-auto text-[10px] text-gray-600">{fmt(catTotal)}/mes</span>
                    </div>
                    <table className="w-full">
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
            Valores em USD. Conversoes de periodo sao estimativas. Atualizado manualmente pela equipe BlockMiner.
          </p>
        </>
      )}
    </div>
  );
}
