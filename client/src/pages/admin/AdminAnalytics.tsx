import { useState, useEffect, useCallback, type ComponentType } from "react";
import {
  TrendingUp,
  Users,
  Zap,
  ArrowDownLeft,
  BarChart2,
  RefreshCw,
  Search,
  Calendar,
  Award,
  Loader2,
  Clock,
  Flame,
  PieChart,
  Activity,
  Wallet,
  type LucideProps
} from "lucide-react";
import { api } from "../../store/auth";
import { toast } from "sonner";

type LucideIcon = ComponentType<LucideProps>;

type StatColor = "amber" | "emerald" | "blue" | "violet" | "rose" | "cyan";

const icnMap: Record<StatColor, string> = {
  amber: "text-amber-500",
  emerald: "text-emerald-400",
  blue: "text-blue-400",
  violet: "text-violet-400",
  rose: "text-rose-400",
  cyan: "text-cyan-400"
};

const bgMap: Record<StatColor, string> = {
  amber: "bg-amber-500/10",
  emerald: "bg-emerald-500/10",
  blue: "bg-blue-500/10",
  violet: "bg-violet-500/10",
  rose: "bg-rose-500/10",
  cyan: "bg-cyan-500/10"
};

function fmtPol(v: unknown, dec = 4): string {
  return `${Number(v || 0).toFixed(dec)} POL`;
}

function fmtUsd(v: unknown, price: number): string | null {
  return price > 0 ? `~$${(Number(v || 0) * price).toFixed(2)}` : null;
}

function fmtUsdLong(v: unknown, price: number): string | null {
  return price > 0 ? `~$${(Number(v || 0) * price).toFixed(4)}` : null;
}

function fmtDuration(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "--";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} dias`;
}

type StatCardProps = {
  label: string;
  polValue: string;
  usdValue?: string | null;
  sub?: string;
  icon: LucideIcon;
  color?: StatColor;
};

function StatCard({ label, polValue, usdValue, sub, icon: Icon, color = "amber" }: StatCardProps) {
  const fg = icnMap[color];
  const bg = bgMap[color];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
          <Icon className={`w-4 h-4 ${fg}`} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <div>
        <p className={`text-base font-black ${fg}`}>{polValue}</p>
        {usdValue ? <p className="text-slate-500 text-xs font-bold mt-0.5">{usdValue}</p> : null}
        {sub ? <p className="text-[10px] text-slate-600 mt-1">{sub}</p> : null}
      </div>
    </div>
  );
}

type ChartPoint = { value: number; label: string };

function MiniBarChart({ data, polPrice, color = "amber" }: { data: ChartPoint[]; polPrice: number; color?: StatColor }) {
  if (!data || data.length === 0)
    return <div className="h-44 flex items-center justify-center text-slate-600 text-xs">Sem dados no periodo</div>;
  const max = Math.max(...data.map((d) => d.value), 0.000001);
  const barColor = `bg-${color}-500/70 hover:bg-${color}-400`;
  return (
    <div className="flex items-end gap-0.5 h-44 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0 group relative">
          <div
            className={`w-full ${barColor} rounded-t transition-all cursor-default`}
            style={{ height: `${Math.max(3, (d.value / max) * 160)}px` }}
          />
          <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
            <div className="bg-slate-800 text-white text-[9px] font-black px-2 py-1.5 rounded-lg whitespace-nowrap border border-slate-700 shadow-xl space-y-0.5">
              <div className="text-amber-400">{d.value.toFixed(6)} POL</div>
              {polPrice > 0 ? <div className="text-slate-400">${(d.value * polPrice).toFixed(4)}</div> : null}
              <div className="text-slate-500">{d.label}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DualBarChart({ data, polPrice }: { data: { label: string; up: number; down: number }[]; polPrice: number }) {
  if (!data || data.length === 0)
    return <div className="h-44 flex items-center justify-center text-slate-600 text-xs">Sem dados no periodo</div>;
  const max = Math.max(...data.flatMap(d => [d.up, d.down]), 0.000001);
  return (
    <div className="flex items-end gap-1 h-44 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex items-end gap-px group relative">
          <div className="flex-1 bg-emerald-500/70 hover:bg-emerald-400 rounded-t transition-all" style={{ height: `${Math.max(2, (d.up / max) * 160)}px` }} />
          <div className="flex-1 bg-rose-500/70 hover:bg-rose-400 rounded-t transition-all" style={{ height: `${Math.max(2, (d.down / max) * 160)}px` }} />
          <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-20 pointer-events-none left-1/2 -translate-x-1/2">
            <div className="bg-slate-800 text-white text-[9px] font-black px-2 py-1.5 rounded-lg whitespace-nowrap border border-slate-700 shadow-xl space-y-0.5">
              <div className="text-emerald-400">+{d.up.toFixed(4)} POL distribuído</div>
              <div className="text-rose-400">-{d.down.toFixed(4)} POL sacado</div>
              {polPrice > 0 ? <div className="text-slate-400">net ${((d.up - d.down) * polPrice).toFixed(2)}</div> : null}
              <div className="text-slate-500">{d.label}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type ForecastCardProps = {
  label: string;
  pol: string;
  usdVal: string | null;
  highlight?: boolean;
};

function ForecastCard({ label, pol, usdVal, highlight = false }: ForecastCardProps) {
  return (
    <div className={`flex flex-col gap-1 p-4 rounded-2xl border transition-colors ${
        highlight ? "bg-amber-500/10 border-amber-500/25" : "bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/70"
      }`}>
      <p className={`text-[9px] font-black uppercase tracking-widest ${highlight ? "text-amber-400" : "text-slate-500"}`}>{label}</p>
      <p className={`text-sm font-black ${highlight ? "text-amber-300" : "text-white"}`}>{pol}</p>
      {usdVal ? <p className="text-[10px] text-slate-500 font-bold">{usdVal}</p> : null}
    </div>
  );
}

type PeriodKey = "week" | "month" | "year";

type AnalyticsUserRef = {
  id: number;
  username?: string | null;
  email?: string | null;
  name?: string | null;
};

type AnalyticsSummary = {
  totalDistributed?: number | string | null;
  periodDistributed?: number | string | null;
  totalWithdrawals?: number | string | null;
  periodWithdrawals?: number | string | null;
  activeUsers?: number | string | null;
  blockCount?: number | string | null;
  totalBlocksEver?: number | string | null;
  networkHashRate?: number | string | null;
  userHashRate?: number | string | null;
};

type ForecastSlice = { pol?: number | string | null };

type AnalyticsForecast = {
  sharePercent?: number | string | null;
  userHashRate?: number | string | null;
  day?: ForecastSlice;
  week?: ForecastSlice;
  month?: ForecastSlice;
  year?: ForecastSlice;
};

type TopEarnerRow = {
  userId: number;
  username?: string | null;
  total: number | string;
};

type UserRecentBlockRow = {
  id: number | string;
  blockId?: number | string | null;
  block?: { blockNumber?: number | string | null } | null;
  rewardAmount: number | string;
  percentage: number | string;
  createdAt: string | number | Date;
};

type AdminAnalyticsResponse = {
  ok: boolean;
  polPrice?: number;
  summary?: AnalyticsSummary;
  forecast?: AnalyticsForecast;
  topEarners?: TopEarnerRow[];
  chartData?: ChartPoint[];
  userRecentBlocks?: UserRecentBlockRow[];
};

type InflationSeriesPoint = { label: string; distributed: number; withdrawn: number; net: number; cumulative: number };
type InflationResponse = {
  ok: boolean;
  polPrice?: number;
  series: InflationSeriesPoint[];
  totals: {
    allTimeDistributed: number;
    allTimeWithdrawn: number;
    periodDistributed: number;
    periodWithdrawn: number;
    circulatingNet: number;
    netInflationRatePercent: number;
    avgDailyDistributed: number;
    avgDailyWithdrawn: number;
  };
};

type ProjectionsResponse = {
  ok: boolean;
  polPrice?: number;
  networkHashRate: number;
  userHashRate: number | null;
  sharePercent: number | null;
  theoretical: { day1: number; day7: number; day30: number; day90: number; day365: number };
  empirical: { avgDailyLast30: number; day7: number; day30: number; day90: number };
  assumptions: { blockRewardPol: number; blocksPerDay: number };
};

type WithdrawalsResponse = {
  ok: boolean;
  polPrice?: number;
  stats: {
    completedCount: number;
    totalAmount: number;
    avg: number; median: number; p90: number; p99: number;
    avgTimeToCompleteMs: number;
    medianTimeToCompleteMs: number;
  };
  statusBreakdownPeriod: { completed: number; pending: number; failed: number; other: number };
  series: { label: string; count: number; amount: number }[];
};

type DistributionResponse = {
  ok: boolean;
  polPrice?: number;
  sources: { key: string; label: string; pol: number; count: number; sharePercent: number }[];
  totalInflowFromSources: number;
  depositsInflow: { key: string; label: string; pol: number; count: number };
  outflows: { key: string; label: string; pol: number; count: number }[];
};

type AdminUserSearchResponse = {
  ok: boolean;
  users?: AnalyticsUserRef[];
};

type PeriodSummaryRow = {
  label: string;
  clr: string;
  val?: string;
  pol?: number | string | null;
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: "7 dias",
  month: "30 dias",
  year: "12 meses"
};

type TabKey = "overview" | "inflation" | "projections" | "withdrawals" | "distribution";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Visão geral", icon: BarChart2 },
  { key: "inflation", label: "Inflação", icon: Flame },
  { key: "projections", label: "Projeções", icon: Activity },
  { key: "withdrawals", label: "Saques", icon: Wallet },
  { key: "distribution", label: "Distribuição por fonte", icon: PieChart },
];

export default function AdminAnalytics() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [tab, setTab] = useState<TabKey>("overview");
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [inflation, setInflation] = useState<InflationResponse | null>(null);
  const [projections, setProjections] = useState<ProjectionsResponse | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalsResponse | null>(null);
  const [distribution, setDistribution] = useState<DistributionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<AnalyticsUserRef[]>([]);
  const [selectedUser, setSelectedUser] = useState<AnalyticsUserRef | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ period });
      if (selectedUser) params.set("userId", String(selectedUser.id));
      const qs = params.toString();
      const [r1, r2, r3, r4, r5] = await Promise.all([
        api.get<AdminAnalyticsResponse>(`/admin/analytics?${qs}`),
        api.get<InflationResponse>(`/admin/analytics/inflation?${qs}`),
        api.get<ProjectionsResponse>(`/admin/analytics/projections?${qs}`),
        api.get<WithdrawalsResponse>(`/admin/analytics/withdrawals?${qs}`),
        api.get<DistributionResponse>(`/admin/analytics/distribution?${qs}`),
      ]);
      if (r1.data.ok) setData(r1.data);
      if (r2.data.ok) setInflation(r2.data);
      if (r3.data.ok) setProjections(r3.data);
      if (r4.data.ok) setWithdrawals(r4.data);
      if (r5.data.ok) setDistribution(r5.data);
    } catch {
      toast.error("Erro ao carregar analytics.");
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedUser]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const searchUsers = async (q: string) => {
    if (!q.trim()) {
      setUserResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.get<AdminUserSearchResponse>(`/admin/users?pageSize=8&q=${encodeURIComponent(q)}`);
      if (res.data.ok) setUserResults(res.data.users || []);
    } catch {
      /* empty */
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void searchUsers(userQuery), 300);
    return () => clearTimeout(t);
  }, [userQuery]);

  const summary = data?.summary;
  const forecast = data?.forecast;
  const topEarners = data?.topEarners;
  const chartData = data?.chartData;
  const userRecentBlocks = data?.userRecentBlocks;
  const polPrice = data?.polPrice ?? inflation?.polPrice ?? 0;
  const periodLabel = PERIOD_LABELS[period];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Analytics de Rendimentos</h2>
          <p className="text-slate-500 text-sm font-medium">
            Distribuicao de recompensas, saques e previsoes.
            {polPrice > 0 ? (
              <span className="ml-2 text-amber-400 font-black">1 POL = ${polPrice.toFixed(4)} USD</span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["week", "month", "year"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                period === p ? "bg-amber-500 text-black" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {p === "week" ? "7D" : p === "month" ? "30D" : "12M"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void fetchAll()}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Search className="w-3 h-3" /> Filtrar por Usuario (opcional)
        </p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserQuery(e.target.value);
              }}
              placeholder="Buscar por nome, e-mail, ID ou carteira..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
            />
            {isSearching ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
            ) : null}
            {userResults.length > 0 ? (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setUserSearch(u.username || u.email || "");
                      setUserResults([]);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-white text-xs font-bold">{u.username || u.name}</p>
                      <p className="text-slate-500 text-[10px]">{u.email}</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-600">#{u.id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {selectedUser ? (
            <button
              type="button"
              onClick={() => {
                setSelectedUser(null);
                setUserSearch("");
                setUserQuery("");
              }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-xs font-black uppercase transition-all"
            >
              Limpar
            </button>
          ) : null}
        </div>
        {selectedUser ? (
          <p className="text-[10px] text-amber-500 font-black mt-2 uppercase tracking-widest">
            Exibindo: {selectedUser.username || selectedUser.email} (#{selectedUser.id})
            {summary?.userHashRate != null ? ` - ${Number(summary.userHashRate).toFixed(2)} H/s` : ""}
            {forecast?.sharePercent != null ? ` - ${Number(forecast.sharePercent).toFixed(3)}% da rede` : ""}
          </p>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap border-b border-slate-800 pb-2">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                active ? "bg-amber-500 text-black" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? (
        <OverviewTab
          isLoading={isLoading} summary={summary} forecast={forecast} topEarners={topEarners}
          chartData={chartData} userRecentBlocks={userRecentBlocks} polPrice={polPrice}
          period={period} periodLabel={periodLabel} selectedUser={selectedUser}
        />
      ) : tab === "inflation" ? (
        <InflationTab data={inflation} polPrice={polPrice} isLoading={isLoading} />
      ) : tab === "projections" ? (
        <ProjectionsTab data={projections} polPrice={polPrice} isLoading={isLoading} selectedUser={selectedUser} />
      ) : tab === "withdrawals" ? (
        <WithdrawalsTab data={withdrawals} polPrice={polPrice} isLoading={isLoading} periodLabel={periodLabel} />
      ) : (
        <DistributionTab data={distribution} polPrice={polPrice} isLoading={isLoading} periodLabel={periodLabel} />
      )}
    </div>
  );
}

// ---------- Overview Tab ----------
function OverviewTab(props: {
  isLoading: boolean; summary?: AnalyticsSummary; forecast?: AnalyticsForecast;
  topEarners?: TopEarnerRow[]; chartData?: ChartPoint[]; userRecentBlocks?: UserRecentBlockRow[];
  polPrice: number; period: PeriodKey; periodLabel: string; selectedUser: AnalyticsUserRef | null;
}) {
  const { isLoading, summary, forecast, topEarners, chartData, userRecentBlocks, polPrice, period, periodLabel, selectedUser } = props;
  return (
    <>
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total distribuido" icon={TrendingUp} color="amber"
            polValue={fmtPol(summary?.totalDistributed)} usdValue={fmtUsd(summary?.totalDistributed, polPrice)} sub="Historico completo" />
          <StatCard label={`Distribuido (${periodLabel})`} icon={BarChart2} color="emerald"
            polValue={fmtPol(summary?.periodDistributed)} usdValue={fmtUsd(summary?.periodDistributed, polPrice)} sub={`Ultimos ${periodLabel}`} />
          <StatCard label="Total saques" icon={ArrowDownLeft} color="violet"
            polValue={fmtPol(summary?.totalWithdrawals)} usdValue={fmtUsd(summary?.totalWithdrawals, polPrice)} sub="Saques completados" />
          {!selectedUser ? (
            <StatCard label={`Usuarios ativos (${periodLabel})`} icon={Users} color="blue"
              polValue={`${summary?.activeUsers ?? "--"} usuários`} usdValue={null}
              sub={`${summary?.blockCount ?? "--"} blocos - ${summary?.totalBlocksEver ?? "--"} total`} />
          ) : (
            <StatCard label={`Saques (${periodLabel})`} icon={ArrowDownLeft} color="blue"
              polValue={fmtPol(summary?.periodWithdrawals)} usdValue={fmtUsd(summary?.periodWithdrawals, polPrice)} sub="No periodo" />
          )}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">
              Previsao de Rendimento
              {selectedUser ? ` -- ${selectedUser.username || selectedUser.email}` : " -- Rede Total"}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {selectedUser
                ? `${Number(forecast?.userHashRate || 0).toFixed(2)} H/s - ${Number(forecast?.sharePercent || 0).toFixed(3)}% da rede`
                : `${Number(summary?.networkHashRate || 0).toFixed(2)} H/s total`}
              - 0.30 POL/bloco - bloco a cada 10 min
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ForecastCard label="Por dia" pol={`${Number(forecast?.day?.pol || 0).toFixed(6)} POL`} usdVal={fmtUsdLong(forecast?.day?.pol, polPrice)} />
          <ForecastCard label="Por semana" pol={`${Number(forecast?.week?.pol || 0).toFixed(6)} POL`} usdVal={fmtUsdLong(forecast?.week?.pol, polPrice)} />
          <ForecastCard label="Por mes" pol={`${Number(forecast?.month?.pol || 0).toFixed(4)} POL`} usdVal={fmtUsdLong(forecast?.month?.pol, polPrice)} highlight />
          <ForecastCard label="Por ano" pol={`${Number(forecast?.year?.pol || 0).toFixed(2)} POL`} usdVal={fmtUsd(forecast?.year?.pol, polPrice)} />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">Distribuicao de Recompensas</p>
            <p className="text-[10px] text-slate-500 mt-0.5">POL distribuido por {period === "year" ? "mes" : "dia"} -- ultimos {periodLabel}</p>
          </div>
          <Calendar className="w-4 h-4 text-slate-600" />
        </div>
        <MiniBarChart data={chartData || []} polPrice={polPrice} />
        {chartData && chartData.length > 0 ? (
          <div className="flex justify-between mt-2">
            <span className="text-[9px] text-slate-600 font-mono">{chartData[0]?.label}</span>
            <span className="text-[9px] text-slate-600 font-mono">{chartData[chartData.length - 1]?.label}</span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {!selectedUser ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" /> Top 10 Ganhadores (historico)
            </p>
            {!topEarners || topEarners.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-8">Sem dados de mineração</p>
            ) : (
              <div className="space-y-1.5">
                {topEarners.map((e, i) => (
                  <div key={e.userId} className="flex items-center justify-between p-3 bg-slate-800/40 hover:bg-slate-800 rounded-xl transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-black w-5 text-center ${
                          i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-600" : "text-slate-600"
                        }`}>#{i + 1}</span>
                      <div>
                        <p className="text-white text-xs font-bold">{e.username}</p>
                        <p className="text-slate-500 text-[9px]">ID #{e.userId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-amber-400 font-black text-xs">{Number(e.total).toFixed(4)} POL</p>
                      {polPrice > 0 ? <p className="text-slate-500 text-[9px]">${(Number(e.total) * polPrice).toFixed(2)}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 ${!selectedUser ? "" : "md:col-span-2"}`}>
          <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            {selectedUser ? `Ultimos 50 blocos -- ${selectedUser.username || selectedUser.email}` : "Resumo do Periodo"}
          </p>
          {selectedUser ? (
            userRecentBlocks && userRecentBlocks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="text-slate-600 font-black uppercase tracking-tighter">
                      <th className="pb-3 px-2">Bloco</th>
                      <th className="pb-3 px-2">Recompensa POL</th>
                      <th className="pb-3 px-2">Valor USD</th>
                      <th className="pb-3 px-2">%</th>
                      <th className="pb-3 px-2 text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {userRecentBlocks.map((r) => (
                      <tr key={String(r.id)} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-2 font-mono text-slate-400">#{r.block?.blockNumber ?? r.blockId}</td>
                        <td className="py-2 px-2 font-black text-amber-400">{Number(r.rewardAmount).toFixed(8)}</td>
                        <td className="py-2 px-2 text-slate-400">{polPrice > 0 ? `$${(Number(r.rewardAmount) * polPrice).toFixed(6)}` : "--"}</td>
                        <td className="py-2 px-2 text-slate-400">{Number(r.percentage).toFixed(2)}%</td>
                        <td className="py-2 px-2 text-right text-slate-600">
                          {new Date(r.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-600 text-xs text-center py-8">Nenhum bloco encontrado para este usuário</p>
            )
          ) : (
            <div className="space-y-2">
              {(
                [
                  { label: "Distribuído no período", pol: summary?.periodDistributed, clr: "text-amber-400" },
                  { label: "Saques no período", pol: summary?.periodWithdrawals, clr: "text-violet-400" },
                  { label: "Usuários mineradores", val: `${summary?.activeUsers ?? "--"} usuários`, clr: "text-blue-400" },
                  { label: "Blocos distribuídos", val: `${summary?.blockCount ?? "--"} blocos`, clr: "text-emerald-400" },
                  { label: "Media por bloco", pol: summary?.blockCount ? Number(summary.periodDistributed) / Number(summary.blockCount) : null, clr: "text-amber-400" },
                  { label: "Total de blocos (historico)", val: `${summary?.totalBlocksEver ?? "--"} blocos`, clr: "text-slate-400" }
                ] satisfies PeriodSummaryRow[]
              ).map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl transition-colors">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">{item.label}</span>
                  <div className="text-right">
                    {item.val ? <span className={`text-xs font-black ${item.clr}`}>{item.val}</span> : null}
                    {item.pol != null ? (
                      <>
                        <p className={`text-xs font-black ${item.clr}`}>{Number(item.pol).toFixed(6)} POL</p>
                        {polPrice > 0 ? <p className="text-[9px] text-slate-500">${(Number(item.pol) * polPrice).toFixed(4)}</p> : null}
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------- Inflation Tab ----------
function InflationTab({ data, polPrice, isLoading }: { data: InflationResponse | null; polPrice: number; isLoading: boolean }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  const dual = data.series.map(s => ({ label: s.label, up: s.distributed, down: s.withdrawn }));
  const cumulative = data.series.map(s => ({ label: s.label, value: s.cumulative }));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Supply circulante (net)" icon={TrendingUp} color="amber"
          polValue={fmtPol(data.totals.circulatingNet, 2)} usdValue={fmtUsd(data.totals.circulatingNet, polPrice)} sub="Distribuído − sacado" />
        <StatCard label="Taxa de inflação líquida" icon={Flame} color="rose"
          polValue={`${data.totals.netInflationRatePercent.toFixed(2)}%`} usdValue={null} sub="(emitido − sacado) / emitido" />
        <StatCard label="Média diária emitida" icon={BarChart2} color="emerald"
          polValue={fmtPol(data.totals.avgDailyDistributed, 4)} usdValue={fmtUsd(data.totals.avgDailyDistributed, polPrice)} sub="Média do período" />
        <StatCard label="Média diária sacada" icon={ArrowDownLeft} color="violet"
          polValue={fmtPol(data.totals.avgDailyWithdrawn, 4)} usdValue={fmtUsd(data.totals.avgDailyWithdrawn, polPrice)} sub="Média do período" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-4">Emissão vs Saques (por bucket)</p>
        <DualBarChart data={dual} polPrice={polPrice} />
        <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500/70 inline-block" /> Distribuído</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500/70 inline-block" /> Sacado</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-4">Curva de supply líquida (cumulativa)</p>
        <MiniBarChart data={cumulative} polPrice={polPrice} />
      </div>
    </>
  );
}

// ---------- Projections Tab ----------
function ProjectionsTab({ data, polPrice, isLoading, selectedUser }: { data: ProjectionsResponse | null; polPrice: number; isLoading: boolean; selectedUser: AnalyticsUserRef | null }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-2">
          Projeções {selectedUser ? `-- ${selectedUser.username || selectedUser.email}` : "-- Rede Total"}
        </p>
        <p className="text-[10px] text-slate-500 mb-5">
          {data.assumptions.blocksPerDay} blocos/dia × {data.assumptions.blockRewardPol} POL/bloco
          {data.sharePercent != null ? ` × ${data.sharePercent.toFixed(3)}% (share do usuário)` : ""}
          {" · "}{Number(data.networkHashRate).toFixed(2)} H/s rede
          {data.userHashRate != null ? ` · ${Number(data.userHashRate).toFixed(2)} H/s usuário` : ""}
        </p>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Teórica (hashrate atual)</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <ForecastCard label="1 dia" pol={fmtPol(data.theoretical.day1, 4)} usdVal={fmtUsd(data.theoretical.day1, polPrice)} />
          <ForecastCard label="7 dias" pol={fmtPol(data.theoretical.day7, 4)} usdVal={fmtUsd(data.theoretical.day7, polPrice)} />
          <ForecastCard label="30 dias" pol={fmtPol(data.theoretical.day30, 2)} usdVal={fmtUsd(data.theoretical.day30, polPrice)} highlight />
          <ForecastCard label="90 dias" pol={fmtPol(data.theoretical.day90, 2)} usdVal={fmtUsd(data.theoretical.day90, polPrice)} />
          <ForecastCard label="365 dias" pol={fmtPol(data.theoretical.day365, 2)} usdVal={fmtUsd(data.theoretical.day365, polPrice)} />
        </div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Empírica (média real últimos 30 dias)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ForecastCard label="Média diária" pol={fmtPol(data.empirical.avgDailyLast30, 4)} usdVal={fmtUsdLong(data.empirical.avgDailyLast30, polPrice)} />
          <ForecastCard label="7 dias" pol={fmtPol(data.empirical.day7, 4)} usdVal={fmtUsd(data.empirical.day7, polPrice)} />
          <ForecastCard label="30 dias" pol={fmtPol(data.empirical.day30, 2)} usdVal={fmtUsd(data.empirical.day30, polPrice)} highlight />
          <ForecastCard label="90 dias" pol={fmtPol(data.empirical.day90, 2)} usdVal={fmtUsd(data.empirical.day90, polPrice)} />
        </div>
      </div>
    </>
  );
}

// ---------- Withdrawals Tab ----------
function WithdrawalsTab({ data, polPrice, isLoading, periodLabel }: { data: WithdrawalsResponse | null; polPrice: number; isLoading: boolean; periodLabel: string }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  const chartAmount: ChartPoint[] = data.series.map(s => ({ label: s.label, value: s.amount }));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Saques concluídos (total)" icon={ArrowDownLeft} color="violet"
          polValue={`${data.stats.completedCount} saques`} usdValue={null} sub={`${fmtPol(data.stats.totalAmount, 2)} acumulado`} />
        <StatCard label="Valor médio" icon={BarChart2} color="amber"
          polValue={fmtPol(data.stats.avg, 4)} usdValue={fmtUsd(data.stats.avg, polPrice)} sub="Por saque" />
        <StatCard label="Mediana" icon={TrendingUp} color="emerald"
          polValue={fmtPol(data.stats.median, 4)} usdValue={fmtUsd(data.stats.median, polPrice)} sub="P50" />
        <StatCard label="P90 / P99" icon={Activity} color="cyan"
          polValue={`${fmtPol(data.stats.p90, 4)}`} usdValue={`P99: ${fmtPol(data.stats.p99, 4)}`} sub="Caudas" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Tempo até saque completar</p>
          <p className="text-white text-base font-black">Médio: {fmtDuration(data.stats.avgTimeToCompleteMs)}</p>
          <p className="text-slate-400 text-xs font-bold mt-1">Mediana: {fmtDuration(data.stats.medianTimeToCompleteMs)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:col-span-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Status no período ({periodLabel})</p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div><p className="text-emerald-400 font-black text-base">{data.statusBreakdownPeriod.completed}</p><p className="text-[9px] text-slate-500 uppercase">Completos</p></div>
            <div><p className="text-amber-400 font-black text-base">{data.statusBreakdownPeriod.pending}</p><p className="text-[9px] text-slate-500 uppercase">Pendentes</p></div>
            <div><p className="text-rose-400 font-black text-base">{data.statusBreakdownPeriod.failed}</p><p className="text-[9px] text-slate-500 uppercase">Falhos</p></div>
            <div><p className="text-slate-400 font-black text-base">{data.statusBreakdownPeriod.other}</p><p className="text-[9px] text-slate-500 uppercase">Outros</p></div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-4">Saques completos por bucket (POL)</p>
        <MiniBarChart data={chartAmount} polPrice={polPrice} color="violet" />
      </div>
    </>
  );
}

// ---------- Distribution Tab ----------
function DistributionTab({ data, polPrice, isLoading, periodLabel }: { data: DistributionResponse | null; polPrice: number; isLoading: boolean; periodLabel: string }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-1">Distribuição por fonte — {periodLabel}</p>
        <p className="text-[10px] text-slate-500 mb-5">Total entrante (recompensas): {fmtPol(data.totalInflowFromSources, 4)} {fmtUsd(data.totalInflowFromSources, polPrice) ?? ""}</p>
        <div className="space-y-2">
          {data.sources.map(s => (
            <div key={s.key} className="p-3 bg-slate-800/40 hover:bg-slate-800/70 rounded-xl">
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <p className="text-white text-xs font-bold">{s.label}</p>
                  <p className="text-[10px] text-slate-500">{s.count} eventos</p>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 font-black text-xs">{fmtPol(s.pol, 4)}</p>
                  <p className="text-[10px] text-slate-500">{s.sharePercent.toFixed(2)}% {fmtUsd(s.pol, polPrice) ?? ""}</p>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500/70" style={{ width: `${Math.max(1, Math.min(100, s.sharePercent))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Entrada externa (depósitos)</p>
          <p className="text-emerald-400 font-black text-base">{fmtPol(data.depositsInflow.pol, 4)}</p>
          <p className="text-slate-500 text-[10px]">{data.depositsInflow.count} depósitos · {fmtUsd(data.depositsInflow.pol, polPrice) ?? ""}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Saída externa (saques)</p>
          {data.outflows.map(o => (
            <div key={o.key}>
              <p className="text-rose-400 font-black text-base">{fmtPol(o.pol, 4)}</p>
              <p className="text-slate-500 text-[10px]">{o.count} saques · {fmtUsd(o.pol, polPrice) ?? ""}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
