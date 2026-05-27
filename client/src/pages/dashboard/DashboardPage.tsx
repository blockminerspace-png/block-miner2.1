import { useState, useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pickaxe,
  Zap,
  Activity,
  Coins,
  Clock,
  TrendingUp,
  ShieldCheck,
  Share2,
  Users,
  Copy,
  Check,
  Link2,
  Banknote,
  Sliders,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { getWalletBalance, patchMiningAllocation, postLinkReferral } from './dashboard.api';
import { useGameStore } from '../../store/game';
import { formatHashrate } from '../../shared/utils/machine';
import { toast } from 'sonner';
import DashboardBanners from './components/DashboardBanners';
import type { DashboardBlockRow, DashboardGameStats, DashboardMinerStats } from '../../types/dashboardStats';
import { safeDashboardNumber, sanitizeDashboardReferralCode } from '../../shared/utils/dashboardInputGuards';

type CardColor = 'blue' | 'cyan' | 'purple' | 'amber' | 'emerald';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readApiErrorMessage(err: unknown, fallback: string): string {
  if (!isRecord(err)) return fallback;
  const resp = err.response;
  if (!isRecord(resp)) return fallback;
  const data = resp.data;
  if (!isRecord(data)) return fallback;
  const msg = data.message;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}

function displayWelcomeName(raw: unknown): string {
  const s = stripDangerousName(String(raw ?? ''));
  return s || '—';
}

function stripDangerousName(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 120);
}

function parseBlockTime(b: DashboardBlockRow): string {
  try {
    const d = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString();
  } catch {
    return '—';
  }
}

type CardProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit: string;
  color: CardColor;
};

function Card({ icon: Icon, label, value, unit, color }: CardProps): ReactElement {
  const colorMap: Record<CardColor, string> = {
    blue: 'bg-blue-500/10 text-blue-400',
    cyan: 'bg-cyan-500/10 text-cyan-400',
    purple: 'bg-purple-500/10 text-purple-400',
    amber: 'bg-amber-500/10 text-amber-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
  };

  return (
    <div className="bg-surface border border-gray-800/50 hover:border-gray-700/50 rounded-3xl p-6 shadow-lg transition-all group overflow-hidden relative h-full flex flex-col">
      <div className="flex items-start gap-4 relative z-10 flex-1">
        <div
          className={`p-3.5 rounded-2xl ${colorMap[color]} group-hover:scale-110 transition-transform duration-300 shrink-0`}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1 flex flex-col h-full">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{label}</p>
          <div className="mt-auto">
            <h3 className="text-2xl font-black text-white truncate tracking-tighter">
              {value}{' '}
              <span className="text-xs font-bold text-gray-500 tracking-normal ml-0.5 uppercase">{unit}</span>
            </h3>
          </div>
        </div>
      </div>
      <div className="absolute right-0 bottom-0 w-16 h-16 bg-gradient-to-br from-transparent to-gray-800/10 rounded-tl-3xl" />
    </div>
  );
}

export default function Dashboard(): ReactElement {
  const { t } = useTranslation();
  const { user, checkSession } = useAuthStore();
  const stats = useGameStore((s) => s.stats as DashboardGameStats | null);
  const initSocket = useGameStore((s) => s.initSocket);
  const [copied, setCopied] = useState(false);
  const [refInput, setRefInput] = useState('');
  const [linkingRef, setLinkingRef] = useState(false);
  const [blkBalance, setBlkBalance] = useState<number | null>(null);
  // Local pending value for the allocation (in % POL, snapped to 5%).
  const [polPercent, setPolPercent] = useState<number | null>(null);
  const [savingAlloc, setSavingAlloc] = useState(false);
  // Allocation modal state
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [draftPol, setDraftPol] = useState<string>('100');
  const [draftShib, setDraftShib] = useState<string>('0');
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  useEffect(() => {
    const syncBalance = async () => {
      try {
        const data = await getWalletBalance();
        if (data?.ok && data.balance !== undefined) {
          const dbBalance = Number(data.balance);
          const blk = Number(data.blkBalance ?? 0);
          if (!Number.isFinite(dbBalance)) return;
          setBlkBalance(Number.isFinite(blk) ? blk : 0);
          useGameStore.setState((state) => {
            const prev = state.stats as DashboardGameStats | null | undefined;
            const prevMiner = prev?.miner;
            if (!prevMiner) {
              return {
                stats: {
                  ...(prev ?? {}),
                  networkHashRate: prev?.networkHashRate ?? 0,
                  miner: {
                    balance: dbBalance,
                    estimatedHashRate: 0,
                    referralCount: 0,
                  },
                } as DashboardGameStats,
              };
            }
            const engineBalance = prevMiner.balance;
            if (Math.abs(dbBalance - engineBalance) < 0.000001) return {};
            return {
              stats: {
                ...prev,
                miner: { ...prevMiner, balance: dbBalance },
              } as DashboardGameStats,
            };
          });
        }
      } catch {
        /* rede: falha silenciosa até ao próximo intervalo */
      }
    };
    void syncBalance();
    const interval = window.setInterval(() => void syncBalance(), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const miner: DashboardMinerStats | undefined = stats?.miner ?? undefined;
  const blockHistory: DashboardBlockRow[] = Array.isArray(stats?.blockHistory) ? stats.blockHistory : [];
  const serverPolBps = Math.max(0, Math.min(10000, Math.round(Number(miner?.miningAllocationPolBps ?? 10000))));
  const serverPolPercent = Math.round(serverPolBps / 100);
  const effectivePolPercent = polPercent ?? serverPolPercent;
  const effectiveShibPercent = 100 - effectivePolPercent;
  const blockRewardPol = Number(stats?.blockReward ?? 0);
  const blockRewardShib = Number(stats?.blockRewardShib ?? 0);
  const shibBalance = Number(miner?.shibBalance ?? 0);

  // Debounced PATCH on slider change (500ms after last change).
  useEffect(() => {
    if (polPercent == null) return;
    if (polPercent === serverPolPercent) return;
    const handle = window.setTimeout(async () => {
      try {
        setSavingAlloc(true);
        const polBps = Math.round(polPercent * 100);
        const res = await patchMiningAllocation(polBps);
        if (res?.ok) {
          toast.success(t('dashboard.mining_allocation_saved'));
          // Reflect saved value into the store so we don't keep "pending" indefinitely.
          useGameStore.setState((state) => {
            const prev = state.stats as DashboardGameStats | null | undefined;
            if (!prev?.miner) return {};
            return {
              stats: {
                ...prev,
                miner: {
                  ...prev.miner,
                  miningAllocationPolBps: Number(res.polBps ?? polBps),
                },
              } as DashboardGameStats,
            };
          });
          setPolPercent(null);
        } else {
          toast.error(res?.message || t('dashboard.mining_allocation_save_failed'));
          setPolPercent(null);
        }
      } catch (err: unknown) {
        toast.error(readApiErrorMessage(err, t('dashboard.mining_allocation_save_failed')));
        setPolPercent(null);
      } finally {
        setSavingAlloc(false);
      }
    }, 500);
    return () => window.clearTimeout(handle);
  }, [polPercent, serverPolPercent, t]);

  const referralLink =
    user?.id != null
      ? `${window.location.origin}/register?ref=${encodeURIComponent(String(user.id))}`
      : '';

  const formattedSpeed = miner ? formatHashrate(miner.estimatedHashRate) : '0 H/s';
  const [speedVal, speedUnit = 'H/s'] = formattedSpeed.split(' ');

  const formattedNetwork = stats?.networkHashRate ? formatHashrate(stats.networkHashRate) : '0 H/s';
  const [netVal, netUnit = 'H/s'] = formattedNetwork.split(' ');

  const handleCopyRef = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link de indicação copiado!');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Tenta de novo.');
    }
  };

  const handleLinkReferral = async () => {
    const sanitized = sanitizeDashboardReferralCode(refInput);
    if (!sanitized || linkingRef) return;
    setLinkingRef(true);
    try {
      const resData = await postLinkReferral(sanitized);
      if (resData.ok) {
        toast.success(resData.message || 'Indicador vinculado com sucesso!');
        setRefInput('');
        await checkSession({ silent: true });
      }
    } catch (err: unknown) {
      toast.error(readApiErrorMessage(err, 'Erro ao vincular indicador.'));
    } finally {
      setLinkingRef(false);
    }
  };

  const welcomeName = displayWelcomeName(user?.name);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">
            {t('dashboard.welcome', { name: welcomeName })}
          </h1>
          <p className="text-gray-500 font-medium max-w-lg">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Sincronizado</span>
        </div>
      </div>
      <DashboardBanners />

      <div className="bg-surface border border-gray-800/50 rounded-2xl p-5 md:p-6 shadow-lg">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                {t('dashboard.mining_allocation_title')}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
                {t('dashboard.mining_allocation_description')}
              </p>
            </div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest self-start sm:self-auto">
              {savingAlloc ? t('dashboard.mining_allocation_saving') : t('dashboard.mining_allocation_applies_next_block')}
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest bg-indigo-600/20 border border-indigo-500/40 text-indigo-300">
                {effectivePolPercent}% {t('dashboard.mining_allocation_pol_label')}
              </span>
              <span className="text-gray-600 text-xs font-black">/</span>
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest bg-amber-600/20 border border-amber-500/40 text-amber-300">
                {effectiveShibPercent}% {t('dashboard.mining_allocation_shib_label')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraftPol(String(effectivePolPercent));
                setDraftShib(String(effectiveShibPercent));
                setDraftError(null);
                setAllocModalOpen(true);
              }}
              disabled={savingAlloc}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-400/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sliders className="w-3.5 h-3.5" />
              {t('dashboard.mining_allocation_edit_split')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px] font-medium">
            <div className="flex items-center justify-between bg-gray-800/30 rounded-lg px-3 py-2">
              <span className="text-gray-500 uppercase tracking-widest text-[9px] font-black">
                {t('dashboard.mining_allocation_estimated_pol')}
              </span>
              <span className="text-indigo-300 font-black">
                {(blockRewardPol * (effectivePolPercent / 100)).toFixed(4)} POL
              </span>
            </div>
            <div className="flex items-center justify-between bg-gray-800/30 rounded-lg px-3 py-2">
              <span className="text-gray-500 uppercase tracking-widest text-[9px] font-black">
                {t('dashboard.mining_allocation_estimated_shib')}
              </span>
              <span className="text-amber-300 font-black">
                {(blockRewardShib * (effectiveShibPercent / 100)).toFixed(2)} SHIB
              </span>
            </div>
          </div>
        </div>
      </div>

      {allocModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!savingAlloc) setAllocModalOpen(false);
          }}
        >
          <div
            className="bg-surface border border-gray-800/80 rounded-2xl shadow-2xl w-full max-w-md p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setAllocModalOpen(false)}
              disabled={savingAlloc}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <h3 className="text-base font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                {t('dashboard.mining_allocation_modal_title')}
              </h3>
              <p className="text-[11px] text-gray-500 mt-2">
                {t('dashboard.mining_allocation_modal_description')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-2">
                  {t('dashboard.mining_allocation_pol_label')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    inputMode="numeric"
                    value={draftPol}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setDraftPol('');
                        setDraftError(null);
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      const clamped = Math.max(0, Math.min(100, Math.round(n)));
                      setDraftPol(String(clamped));
                      setDraftShib(String(100 - clamped));
                      setDraftError(null);
                    }}
                    disabled={savingAlloc}
                    className="w-full bg-gray-900/80 border border-indigo-500/30 rounded-xl px-4 py-3 pr-10 text-white font-black text-lg tabular-nums focus:outline-none focus:border-indigo-400 disabled:opacity-50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300 font-black text-sm">%</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-amber-300 mb-2">
                  {t('dashboard.mining_allocation_shib_label')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    inputMode="numeric"
                    value={draftShib}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setDraftShib('');
                        setDraftError(null);
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      const clamped = Math.max(0, Math.min(100, Math.round(n)));
                      setDraftShib(String(clamped));
                      setDraftPol(String(100 - clamped));
                      setDraftError(null);
                    }}
                    disabled={savingAlloc}
                    className="w-full bg-gray-900/80 border border-amber-500/30 rounded-xl px-4 py-3 pr-10 text-white font-black text-lg tabular-nums focus:outline-none focus:border-amber-400 disabled:opacity-50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-300 font-black text-sm">%</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {[0, 25, 50, 75, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={savingAlloc}
                  onClick={() => {
                    setDraftPol(String(preset));
                    setDraftShib(String(100 - preset));
                    setDraftError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gray-800/60 border border-gray-700/60 text-gray-300 hover:bg-gray-700/60 hover:text-white transition disabled:opacity-50"
                >
                  {preset}/{100 - preset}
                </button>
              ))}
            </div>

            {draftError && (
              <p className="text-[11px] font-bold text-red-400 mb-3">{draftError}</p>
            )}

            <p className="text-[10px] text-gray-500 mb-5">
              {t('dashboard.mining_allocation_modal_hint')}
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAllocModalOpen(false)}
                disabled={savingAlloc}
                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition disabled:opacity-50"
              >
                {t('dashboard.mining_allocation_modal_cancel')}
              </button>
              <button
                type="button"
                disabled={savingAlloc}
                onClick={() => {
                  const pol = Number(draftPol);
                  const shib = Number(draftShib);
                  if (!Number.isFinite(pol) || !Number.isFinite(shib)) {
                    setDraftError(t('dashboard.mining_allocation_modal_error_invalid'));
                    return;
                  }
                  if (pol < 0 || pol > 100 || shib < 0 || shib > 100) {
                    setDraftError(t('dashboard.mining_allocation_modal_error_range'));
                    return;
                  }
                  if (pol + shib !== 100) {
                    setDraftError(t('dashboard.mining_allocation_modal_error_sum'));
                    return;
                  }
                  // Snap to nearest 5%.
                  const snapped = Math.round(pol / 5) * 5;
                  setPolPercent(snapped);
                  setAllocModalOpen(false);
                }}
                className="px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAlloc
                  ? t('dashboard.mining_allocation_saving')
                  : t('dashboard.mining_allocation_modal_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card
          icon={Coins}
          label={t('dashboard.balance')}
          value={miner ? safeDashboardNumber(miner.balance, 6) : '0.000000'}
          unit={stats?.tokenSymbol || 'POL'}
          color="blue"
        />
        <Card
          icon={Banknote}
          label="BLK interno (não sacável)"
          value={blkBalance != null ? safeDashboardNumber(blkBalance, 4) : '—'}
          unit="BLK"
          color="cyan"
        />
        <Card icon={Pickaxe} label={t('dashboard.speed')} value={speedVal} unit={speedUnit} color="purple" />
        <Card icon={Zap} label={t('dashboard.network_power')} value={netVal} unit={netUnit} color="amber" />
        <Card
          icon={Clock}
          label={t('dashboard.next_block')}
          value={safeDashboardNumber(stats?.blockCountdownSeconds ?? 0, 0)}
          unit="segs"
          color="emerald"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-surface border border-gray-800/50 rounded-3xl overflow-hidden shadow-xl">
            <div className="px-8 py-6 border-b border-gray-800/50 flex justify-between items-center bg-gray-800/20">
              <h2 className="text-lg font-bold text-white flex items-center gap-3">
                <Activity className="w-5 h-5 text-primary" /> {t('dashboard.history_title')}
              </h2>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('dashboard.last_blocks')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-800/30 text-[10px] uppercase font-bold tracking-widest text-gray-500">
                  <tr>
                    <th className="px-8 py-4">{t('dashboard.block_id')}</th>
                    <th className="px-8 py-4">Meu Ganho</th>
                    <th className="px-8 py-4">Total do Bloco</th>
                    <th className="px-8 py-4 text-right">{t('dashboard.time')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50 font-medium">
                  {blockHistory.slice(0, 5).map((block) => (
                    <tr key={block.blockNumber} className="hover:bg-primary/5 transition-colors group">
                      <td className="px-8 py-5">
                        <span className="bg-gray-800/50 px-3 py-1 rounded-lg text-xs font-bold text-white group-hover:text-primary transition-colors">
                          #{Number(block.blockNumber)}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-start gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5" />
                          <div className="flex flex-col leading-tight">
                            <span className="text-emerald-400 font-black">
                              +{safeDashboardNumber(block.userReward, 4)}{' '}
                              <span className="text-[10px] font-normal">{stats?.tokenSymbol}</span>
                            </span>
                            {Number(block.userRewardShib ?? 0) > 0 && (
                              <span className="text-amber-300 font-black text-[11px]">
                                +{safeDashboardNumber(block.userRewardShib, 2)}{' '}
                                <span className="text-[9px] font-normal">SHIB</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-gray-300 font-bold">
                        <div className="flex flex-col leading-tight">
                          <span className="inline-flex items-center gap-2">
                            {safeDashboardNumber(block.totalReward, 4)} {stats?.tokenSymbol}
                            {block.persistFailed ? (
                              <span
                                className="text-[9px] font-bold uppercase tracking-wider text-amber-400/90"
                                title="A gravação deste bloco na base falhou; ninguém recebeu POL neste ciclo."
                              >
                                DB
                              </span>
                            ) : null}
                          </span>
                          {Number(block.totalRewardShib ?? 0) > 0 && (
                            <span className="text-amber-300/80 text-[11px] font-bold">
                              {safeDashboardNumber(block.totalRewardShib, 2)} SHIB
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right text-gray-500 font-mono text-xs">{parseBlockTime(block)}</td>
                    </tr>
                  ))}
                  {blockHistory.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-12 text-center text-gray-500 font-medium italic">
                        {t('dashboard.no_blocks')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Share2 className="w-32 h-32 text-primary -rotate-12" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-4 max-w-md">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-xl font-black text-white italic uppercase tracking-tighter">Programa de Afiliados</h2>
                </div>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                  Convide seus amigos e ganhe bônus de mineração vitalícios sobre cada bloco que eles minerarem.
                </p>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Indicados Ativos</span>
                    <span className="text-xl font-black text-white">{miner?.referralCount ?? 0}</span>
                  </div>
                  <div className="w-[1px] h-8 bg-gray-800" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Bônus Estimado</span>
                    <span className="text-xl font-black text-emerald-400">10%</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 max-w-sm space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-2">Seu Link de Indicação</span>
                  {user?.id != null && (
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-[10px] text-gray-600 uppercase tracking-widest">Seu código:</span>
                      <span className="text-xs font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg tracking-widest select-all">
                        {String(user.id)}
                      </span>
                    </div>
                  )}
                  <div className="relative flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1.5 focus-within:border-primary/50 transition-all shadow-inner">
                    <input
                      type="text"
                      readOnly
                      value={referralLink || '—'}
                      className="bg-transparent border-none text-xs font-bold text-gray-400 px-4 w-full focus:outline-none"
                      aria-label="Link de indicação"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyRef()}
                      disabled={!referralLink}
                      className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-xl transition-all active:scale-95 group/btn disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {!user?.hasReferral && (
                  <div className="space-y-2 pt-1 border-t border-gray-800/60">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-2">
                      Tem um código de um amigo?
                    </span>
                    <div className="relative flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1.5 focus-within:border-amber-500/50 transition-all shadow-inner">
                      <Link2 className="w-4 h-4 text-gray-600 ml-3 shrink-0" aria-hidden />
                      <input
                        type="text"
                        placeholder="Cole o código aqui"
                        value={refInput}
                        maxLength={64}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => setRefInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleLinkReferral();
                        }}
                        className="bg-transparent border-none text-xs font-bold text-gray-400 placeholder:text-gray-700 px-3 w-full focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleLinkReferral()}
                        disabled={!sanitizeDashboardReferralCode(refInput) || linkingRef}
                        className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-[10px] font-black uppercase px-3 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0"
                      >
                        {linkingRef ? '...' : 'Vincular'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-primary to-blue-600 rounded-3xl p-8 text-white shadow-2xl shadow-primary/20 relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="text-xl font-black mb-2 tracking-tight">{t('dashboard.account_status')}</h3>
              <p className="text-blue-100/70 text-sm font-medium leading-relaxed mb-6">{t('dashboard.efficiency_msg')}</p>
              <button
                type="button"
                className="px-6 py-3 bg-white text-primary rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg"
              >
                {t('common.next')}
              </button>
            </div>
            <Pickaxe className="absolute right-[-20px] bottom-[-20px] w-48 h-48 text-white/10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
          </div>

          <div className="bg-surface border border-gray-800/50 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest text-gray-400">
              {t('dashboard.real_time_earnings')}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">HashRate Estimado</span>
                <span className="text-sm font-bold text-white">
                  {miner ? formatHashrate(miner.estimatedHashRate) : '0 H/s'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-pulse" style={{ width: '65%' }} />
              </div>
              <p className="text-[10px] text-gray-500 font-medium">Baseado na média de participação dos últimos 10 blocos.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
