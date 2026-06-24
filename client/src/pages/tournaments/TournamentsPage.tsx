import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Trophy,
  Clock,
  Users,
  Medal,
  Crown,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Loader2,
  RefreshCw,
  Zap,
  TrendingUp,
  CalendarDays,
  Gift,
  CheckCircle2,
  XCircle,
  Cpu,
  Wallet,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../../store/auth';
import { formatHashrate } from '../../shared/utils/machine';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TournamentPrize {
  id: number;
  rankFrom: number;
  rankTo: number;
  prizeType: 'POL' | 'BLK' | 'MINING_BOOST' | 'MACHINE';
  polAmount?: string;
  blkAmount?: string;
  boostHashRate?: number;
  boostHours?: number;
  minerName?: string;
  minerCount?: number;
  minerId?: number | null;
  miner?: {
    id: number;
    name: string;
    imageUrl?: string | null;
    baseHashRate?: number | string;
  } | null;
}

interface TournamentSummary {
  id: number;
  name: string;
  description?: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  metric: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  prizes: TournamentPrize[];
  _count: { entries: number };
}

interface LeaderboardEntry {
  id: number;
  score: number;
  rank?: number;
  user: { id: number; username: string; name?: string; avatarUrl?: string };
}

interface TournamentDetail {
  tournament: TournamentSummary;
  top: LeaderboardEntry[];
  myEntry?: { score: number; rank?: number; rewardGranted: boolean } | null;
  myRankLive?: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  DAILY: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  WEEKLY: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  MONTHLY: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CUSTOM: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
};

type CategoryInfo = { id: string; key: string; icon: typeof Gift };
const METRIC_CATEGORY: Record<string, CategoryInfo> = {
  OFFERS_ALL:      { id: 'offerwall', key: 'offerwall', icon: Gift },
  OFFERS_INTERNAL: { id: 'offerwall', key: 'offerwall', icon: Gift },
  OFFERS_EXTERNAL: { id: 'offerwall', key: 'offerwall', icon: Gift },
  DEPOSITS_POL:    { id: 'deposit',   key: 'deposit',   icon: Wallet },
  HASHRATE:        { id: 'mining',    key: 'mining',    icon: Cpu },
  BLOCKS_MINED:    { id: 'mining',    key: 'mining',    icon: Cpu },
  CHECKINS:        { id: 'activity',  key: 'activity',  icon: CheckCircle2 },
  TASKS_COMPLETED: { id: 'activity',  key: 'activity',  icon: CheckCircle2 },
};
const CATEGORY_FALLBACK: CategoryInfo = { id: 'other', key: 'other', icon: Trophy };
const CATEGORY_ORDER = ['offerwall', 'deposit', 'mining', 'activity', 'other'];

function categoryOf(metric: string): CategoryInfo {
  return METRIC_CATEGORY[metric] ?? CATEGORY_FALLBACK;
}

function formatScore(score: number, metric: string): string {
  if (metric === 'HASHRATE') return formatHashrate(score);
  if (metric === 'DEPOSITS_POL') return `${score.toFixed(4)} POL`;
  return score.toLocaleString();
}

function formatPrizeStr(prize: TournamentPrize): string {
  if (prize.prizeType === 'POL') return `${Number(prize.polAmount ?? 0).toFixed(2)} POL`;
  if (prize.prizeType === 'BLK') return `${Number(prize.blkAmount ?? 0).toFixed(2)} BLK`;
  if (prize.prizeType === 'MINING_BOOST')
    return `${formatHashrate(prize.boostHashRate ?? 0)} / ${prize.boostHours}h`;
  if (prize.prizeType === 'MACHINE') {
    const name = prize.miner?.name ?? prize.minerName ?? 'Machine';
    return `${prize.minerCount ?? 1}× ${name}`;
  }
  return '';
}

function rankBadgeStyle(rankFrom: number): string {
  if (rankFrom === 1) return 'bg-amber-500 text-slate-950';
  if (rankFrom === 2) return 'bg-slate-300 text-slate-950';
  if (rankFrom === 3) return 'bg-orange-700 text-white';
  return 'bg-slate-700 text-slate-300';
}

function CountdownBadge({ endsAt, status }: { endsAt: string; status: string }) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    if (status !== 'ACTIVE') return;
    const update = () => setDiff(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt, status]);

  if (status === 'SCHEDULED') {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms > 0) {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return (
        <span className="flex items-center gap-1 text-xs text-slate-400 font-mono">
          <Clock className="h-3 w-3" />
          {t('tournaments.startsIn', { h, m })}
        </span>
      );
    }
    return null;
  }

  if (status !== 'ACTIVE' || diff === 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
      <Clock className="h-3 w-3 animate-pulse" />
      {h > 0 ? t('tournaments.remaining', { h, m }) : t('tournaments.remainingShort', { m, s })}
    </span>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-bold text-slate-500 w-5 text-center font-mono">{rank}</span>;
}

function PrizeRichRow({ prize }: { prize: TournamentPrize }) {
  const { t } = useTranslation();
  const rankBadge = (
    <span
      className={`shrink-0 inline-flex h-7 min-w-[2rem] items-center justify-center rounded-lg px-2 font-black text-[10px] shadow ${rankBadgeStyle(prize.rankFrom)}`}
    >
      {prize.rankFrom === prize.rankTo ? `#${prize.rankFrom}` : `#${prize.rankFrom}–${prize.rankTo}`}
    </span>
  );
  if (prize.prizeType === 'MACHINE') {
    const name = prize.miner?.name ?? prize.minerName ?? t('tournaments.admin.machine');
    const hash = prize.miner?.baseHashRate;
    const count = prize.minerCount ?? 1;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/15 bg-slate-900/60 p-2 pr-3 hover:border-amber-500/30 transition-colors">
        {rankBadge}
        <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-800 border border-white/10 overflow-hidden flex items-center justify-center">
          {prize.miner?.imageUrl ? (
            <img src={prize.miner.imageUrl} alt={name} className="w-full h-full object-contain p-0.5" />
          ) : (
            <Cpu className="w-4 h-4 text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white truncate leading-tight">{name}</p>
          {hash !== undefined && hash !== null && (
            <p className="text-[10px] text-amber-300/90 font-mono mt-0.5 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              {formatHashrate(hash)}
            </p>
          )}
        </div>
        {count > 1 && (
          <span className="shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-300">
            ×{count}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-900/40 border border-white/5 px-2 py-2">
      {rankBadge}
      <span className="text-xs text-slate-200 font-bold">{formatPrizeStr(prize)}</span>
    </div>
  );
}

function PrizeCompactRow({ prize }: { prize: TournamentPrize }) {
  const { t } = useTranslation();
  const label =
    prize.prizeType === 'MACHINE'
      ? `${(prize.minerCount ?? 1) > 1 ? `${prize.minerCount}× ` : ''}${prize.miner?.name ?? prize.minerName ?? t('tournaments.admin.machine')}`
      : formatPrizeStr(prize);
  return (
    <li className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-white/[0.03] transition-colors">
      <span
        className={`shrink-0 inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 font-black text-[9px] ${rankBadgeStyle(prize.rankFrom)}`}
      >
        {prize.rankFrom === prize.rankTo ? `#${prize.rankFrom}` : `#${prize.rankFrom}–${prize.rankTo}`}
      </span>
      <span className="min-w-0 flex-1 truncate text-slate-300">{label}</span>
      {prize.prizeType === 'MACHINE' && prize.miner?.baseHashRate != null && (
        <span className="shrink-0 text-[10px] font-mono text-amber-400/70">
          {formatHashrate(prize.miner.baseHashRate)}
        </span>
      )}
    </li>
  );
}

function PrizeList({ prizes }: { prizes: TournamentPrize[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (prizes.length === 0) return <p className="text-xs text-slate-600">{t('tournaments.noPrizes')}</p>;
  const sorted = [...prizes].sort((a, b) => a.rankFrom - b.rankFrom);
  const TOP = sorted.slice(0, 3);
  const REST = sorted.slice(3);
  return (
    <div className="space-y-2">
      {TOP.map((p) => <PrizeRichRow key={p.id} prize={p} />)}
      {REST.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest font-mono text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span>{t('tournaments.moreTiers', { count: REST.length })}</span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded && (
            <ul className="divide-y divide-white/[0.04] border-t border-white/5">
              {REST.map((p) => <PrizeCompactRow key={p.id} prize={p} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TournamentsPage() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<TournamentDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; tournaments: TournamentSummary[] }>('/tournaments');
      setTournaments(res.data.tournaments ?? []);
    } catch {
      setError(t('tournaments.errors.loadList'));
    } finally {
      setLoadingList(false);
    }
  }, [t]);

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await api.get<TournamentDetail>(`/tournaments/${id}`);
      setSelected(res.data);
    } catch {
      setError(t('tournaments.errors.loadDetail'));
      setSelected(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [t]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else setSelected(null);
  }, [selectedId, loadDetail]);

  const active = tournaments.filter((tn) => tn.status === 'ACTIVE');
  const upcoming = tournaments.filter((tn) => tn.status === 'SCHEDULED');
  // Derive type display order from backend-ordered data (respects admin config)
  const typeOrderFromData = [...new Set(tournaments.map((t) => t.type))];

  // Group active tournaments by category id.
  const grouped = (() => {
    const m = new Map<string, { info: CategoryInfo; items: TournamentSummary[] }>();
    for (const tn of active) {
      const info = categoryOf(tn.metric);
      if (!m.has(info.id)) m.set(info.id, { info, items: [] });
      m.get(info.id)!.items.push(tn);
    }
    return [...m.values()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.info.id) - CATEGORY_ORDER.indexOf(b.info.id),
    );
  })();

  const currentCategory = selectedCategory
    ? grouped.find((g) => g.info.id === selectedCategory)
    : null;

  // Auto-pick: if only one category exists, jump straight into it.
  useEffect(() => {
    if (selectedCategory == null && grouped.length === 1) {
      setSelectedCategory(grouped[0].info.id);
    }
  }, [grouped, selectedCategory]);

  // When a category is chosen, auto-pick the most relevant type (closest to ending).
  const prevCategoryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentCategory) {
      setSelectedType(null);
      setSelectedId(null);
      prevCategoryRef.current = null;
      return;
    }
    // Only auto-pick when the category actually changes, not on every render.
    if (prevCategoryRef.current === currentCategory.info.id) return;
    prevCategoryRef.current = currentCategory.info.id;

    const types = [...new Set(currentCategory.items.map((tn) => tn.type))].sort(
      (a, b) => typeOrderFromData.indexOf(a) - typeOrderFromData.indexOf(b),
    ) as string[];
    if (!selectedType || !types.includes(selectedType)) {
      setSelectedType(types[0] ?? null);
    }
  }, [currentCategory, selectedType]);

  // Resolve selectedId from (category, type).
  useEffect(() => {
    if (!currentCategory || !selectedType) return;
    const matches = currentCategory.items.filter((tn) => tn.type === selectedType);
    const pick =
      matches.find(
        (tn) => tn.status === 'ACTIVE' && new Date(tn.endsAt).getTime() > Date.now(),
      ) ?? matches[0];
    setSelectedId(pick ? pick.id : null);
  }, [currentCategory, selectedType]);

  const sameSlotTournaments = currentCategory && selectedType
    ? currentCategory.items.filter((tn) => tn.type === selectedType)
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {selectedCategory && grouped.length > 1 ? (
            <button
              onClick={() => { setSelectedCategory(null); setSelectedType(null); setSelectedId(null); setSelected(null); }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/60 border border-white/10 text-slate-300 hover:bg-slate-700/60 transition-colors"
              aria-label={t('tournaments.header.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Trophy className="h-5 w-5 text-amber-400" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-black text-white">
              {currentCategory ? t('tournaments.header.titleWithCategory', { category: t(`tournaments.categories.${currentCategory.info.key}`) }) : t('tournaments.header.title')}
            </h1>
            <p className="text-xs text-slate-500">{t('tournaments.header.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={() => { void loadList(); if (selectedId) void loadDetail(selectedId); }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(loadingList || loadingDetail) ? 'animate-spin' : ''}`} />
          {t('tournaments.header.refresh')}
        </button>
      </div>

      <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="tournaments-top" />

      {/* LEVEL 1: category grid */}
      {!currentCategory && grouped.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {grouped.map(({ info, items }) => {
            const Icon = info.icon;
            const totalParticipants = items.reduce((s, x) => s + (x._count?.entries ?? 0), 0);
            return (
              <button
                key={info.id}
                onClick={() => setSelectedCategory(info.id)}
                className="group rounded-2xl border border-white/8 bg-slate-900/40 p-5 text-left hover:border-sky-500/40 hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 group-hover:bg-sky-500/25 transition-colors">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-black text-white">{t(`tournaments.categories.${info.key}`)}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {items.length} {t('tournaments.activeTournaments', { count: items.length })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-sky-400" />
                    {t('tournaments.participants', { count: totalParticipants })}
                  </span>
                  <span className="flex items-center gap-1 flex-wrap">
                    {[...new Set(items.map((x) => x.type))]
                      .sort((a, b) => typeOrderFromData.indexOf(a) - typeOrderFromData.indexOf(b))
                      .map((tp) => (
                        <span key={tp} className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${TYPE_COLOR[tp]}`}>
                          {t(`tournaments.types.${tp}`)}
                        </span>
                      ))}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* LEVEL 2: period pills */}
      {currentCategory && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {[...new Set(currentCategory.items.map((tn) => tn.type))]
              .sort((a, b) => typeOrderFromData.indexOf(a) - typeOrderFromData.indexOf(b))
              .map((tp) => {
                const isActive = tp === selectedType;
                return (
                  <button
                    key={tp}
                    onClick={() => setSelectedType(tp)}
                    className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                      isActive
                        ? 'border-sky-500/50 bg-sky-500/10 text-white'
                        : 'border-white/8 bg-slate-900/40 text-slate-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {t(`tournaments.types.${tp}`)}
                  </button>
                );
              })}
          </div>
          {sameSlotTournaments.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {sameSlotTournaments.map((tn) => (
                <button
                  key={tn.id}
                  onClick={() => setSelectedId(tn.id)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] transition-all ${
                    tn.id === selectedId
                      ? 'border-sky-500/40 bg-sky-500/10 text-white'
                      : 'border-white/8 bg-slate-900/30 text-slate-400 hover:text-white'
                  }`}
                >
                  {tn.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {selectedId != null && (loadingDetail && !selected) && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      )}

      {/* Detail view — Hall da Fama style podium + table */}
      {selected && (
        <div className="space-y-8">
          {/* Header band: name + metric + countdown + prizes summary */}
          <div className="rounded-[2rem] border border-white/8 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950 overflow-hidden">
            <div className="grid md:grid-cols-[1fr_auto] gap-6 p-6 md:p-7 items-center">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${TYPE_COLOR[selected.tournament.type]}`}>
                    {t(`tournaments.types.${selected.tournament.type}`)}
                  </span>
                  {selected.tournament.status === 'ACTIVE' && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {t('tournaments.status.LIVE')}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">{selected.tournament.name}</h2>
                <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    {t(`tournaments.metrics.${selected.tournament.metric}`)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-sky-400" />
                    {t('tournaments.participants', { count: selected.tournament._count.entries })}
                  </span>
                  <CountdownBadge endsAt={selected.tournament.endsAt} status={selected.tournament.status} />
                </div>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 max-w-xs">
                <p className="text-[10px] uppercase tracking-widest text-amber-400 font-mono mb-2">{t('tournaments.prizes')}</p>
                <PrizeList prizes={selected.tournament.prizes} />
              </div>
            </div>
            {selected.myEntry && (
              <div className="border-t border-white/8 bg-sky-500/5 px-6 py-3 flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="text-sky-300 font-bold uppercase tracking-wider">{t('tournaments.yourResult')}</span>
                <div className="flex items-center gap-4">
                  <span className="font-mono font-black text-white text-lg">
                    #{selected.myRankLive ?? selected.myEntry.rank ?? '—'}
                  </span>
                  <span className="text-slate-400">{t('tournaments.score')}: <span className="text-white font-mono font-bold">{formatScore(selected.myEntry.score, selected.tournament.metric)}</span></span>
                  {selected.myEntry.rewardGranted && (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="h-3 w-3" /> {t('tournaments.rewardCredited')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {loadingDetail && selected.top.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : selected.top.length === 0 ? (
            <div className="rounded-[2.5rem] border border-white/8 bg-slate-900/40 py-16 text-center">
              <Trophy className="h-10 w-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-semibold">{t('tournaments.empty.noParticipants')}</p>
              <p className="text-xs text-slate-600 mt-1">{t('tournaments.empty.beFirst')}</p>
            </div>
          ) : (
            <>
              {/* TOP 3 PODIUM — Hall da Fama style */}
              {selected.top.length >= 3 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                  {/* Rank 2 */}
                  <div className="order-2 md:order-1 bg-slate-900/60 border border-slate-700/40 rounded-[2.5rem] overflow-hidden text-center relative group">
                    <div className="p-8 space-y-4 flex flex-col justify-center items-center min-h-[280px]">
                      <div className="absolute top-0 inset-x-0 h-1 bg-slate-400/40" />
                      <div className="absolute top-4 left-4">
                        <span className="w-8 h-8 bg-slate-400 text-slate-950 rounded-lg flex items-center justify-center font-black text-xs shadow-lg">2</span>
                      </div>
                      <div className="relative z-10">
                        <div className="w-16 h-16 bg-slate-400/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-slate-400/20 group-hover:scale-110 transition-transform">
                          <Medal className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-black text-white truncate px-4">{selected.top[1].user.name || selected.top[1].user.username}</h3>
                        <p className="text-amber-300 font-bold text-lg font-mono">{formatScore(selected.top[1].score, selected.tournament.metric)}</p>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('tournaments.podium.second')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Rank 1 */}
                  <div className="order-1 md:order-2 bg-gradient-to-b from-amber-500/15 to-slate-900/80 border border-amber-500/40 rounded-[3rem] overflow-hidden text-center relative shadow-2xl shadow-amber-500/10 group">
                    <div className="p-10 space-y-6 flex flex-col justify-center items-center min-h-[340px]">
                      <div className="absolute top-0 inset-x-0 h-1.5 bg-amber-500" />
                      <div className="absolute top-6 left-6">
                        <span className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-black text-base shadow-xl animate-bounce">1</span>
                      </div>
                      <div className="relative z-10">
                        <div className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-500/30 shadow-xl group-hover:scale-110 transition-transform duration-500">
                          <Crown className="w-12 h-12 text-slate-950" />
                        </div>
                        <h3 className="text-2xl font-black text-white truncate px-4">{selected.top[0].user.name || selected.top[0].user.username}</h3>
                        <p className="text-amber-400 font-black text-2xl font-mono">{formatScore(selected.top[0].score, selected.tournament.metric)}</p>
                        <span className="text-xs font-black text-amber-500/60 uppercase tracking-[0.3em]">{t('tournaments.podium.champion')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Rank 3 */}
                  <div className="order-3 md:order-3 bg-slate-900/60 border border-orange-700/40 rounded-[2.5rem] overflow-hidden text-center relative group">
                    <div className="p-8 space-y-4 flex flex-col justify-center items-center min-h-[280px]">
                      <div className="absolute top-0 inset-x-0 h-1 bg-orange-700/40" />
                      <div className="absolute top-4 left-4">
                        <span className="w-8 h-8 bg-orange-700 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-lg">3</span>
                      </div>
                      <div className="relative z-10">
                        <div className="w-16 h-16 bg-orange-700/15 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-orange-700/30 group-hover:scale-110 transition-transform">
                          <Medal className="w-8 h-8 text-orange-500" />
                        </div>
                        <h3 className="text-xl font-black text-white truncate px-4">{selected.top[2].user.name || selected.top[2].user.username}</h3>
                        <p className="text-amber-300 font-bold text-lg font-mono">{formatScore(selected.top[2].score, selected.tournament.metric)}</p>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('tournaments.podium.third')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* RANKING TABLE */}
              <div className="bg-slate-900/60 border border-white/8 rounded-[2.5rem] overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-slate-800/40 text-[10px] uppercase font-bold tracking-widest text-gray-500">
                      <tr>
                        <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 w-12 sm:w-20">Rank</th>
                        <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6">{t('tournaments.header.subtitle').includes('ranking') ? 'Miner' : 'Miner'}</th>
                        <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 text-right">{t(`tournaments.metrics.${selected.tournament.metric}`)}</th>
                        <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 text-right hidden sm:table-cell">{t('tournaments.prizes')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium">
                      {selected.top.slice(0, 10).map((entry, i) => {
                        const rank = i + 1;
                        const myRank = selected.myRankLive ?? selected.myEntry?.rank ?? null;
                        const isMe = myRank != null && rank === myRank;
                        const prize = selected.tournament.prizes.find(
                          (p) => rank >= p.rankFrom && rank <= p.rankTo,
                        );
                        return (
                          <tr key={entry.id} className={`hover:bg-white/4 transition-colors ${isMe ? 'bg-sky-500/8' : i < 3 ? 'bg-amber-500/5' : ''}`}>
                            <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5">
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${
                                i === 0 ? 'bg-amber-500 text-slate-950' :
                                i === 1 ? 'bg-slate-400 text-slate-950' :
                                i === 2 ? 'bg-orange-700 text-white' :
                                          'bg-slate-800 text-slate-500'
                              }`}>{rank}</span>
                            </td>
                            <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-white border border-slate-700 shrink-0">
                                  {(entry.user.name || entry.user.username).charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-white font-bold truncate max-w-[150px] sm:max-w-none">
                                    {entry.user.name || entry.user.username}
                                    {isMe && <span className="ml-1.5 text-[10px] text-sky-400 font-mono">(you)</span>}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-mono">@{entry.user.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-right text-amber-300 font-black text-xs sm:text-sm font-mono">
                              {formatScore(entry.score, selected.tournament.metric)}
                            </td>
                            <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-right hidden sm:table-cell">
                              {prize ? (
                                prize.prizeType === 'MACHINE' ? (
                                  <div className="inline-flex items-center gap-3 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-500/5 pl-2 pr-4 py-2 shadow-md shadow-amber-500/10">
                                    <div className="w-12 h-12 rounded-lg bg-slate-900 border border-amber-500/20 overflow-hidden flex items-center justify-center shrink-0">
                                      {prize.miner?.imageUrl ? (
                                        <img src={prize.miner.imageUrl} alt="" className="w-full h-full object-contain p-1" />
                                      ) : (
                                        <Cpu className="w-5 h-5 text-slate-500" />
                                      )}
                                    </div>
                                    <div className="text-left leading-tight">
                                      <p className="text-sm font-black text-amber-100 truncate max-w-[180px] flex items-center gap-1.5">
                                        {(prize.minerCount ?? 1) > 1 && (
                                          <span className="shrink-0 rounded-md bg-amber-500/25 px-1.5 py-0.5 text-[11px] font-black text-amber-200">
                                            ×{prize.minerCount}
                                          </span>
                                        )}
                                        {prize.miner?.name ?? prize.minerName ?? t('tournaments.admin.machine')}
                                      </p>
                                      {prize.miner?.baseHashRate != null && (
                                        <p className="text-[11px] text-amber-400 font-mono font-bold mt-0.5 flex items-center gap-1">
                                          <Zap className="w-3 h-3" />
                                          {formatHashrate(prize.miner.baseHashRate)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-500/5 px-4 py-2 text-sm font-black text-amber-100 shadow-md shadow-amber-500/10">
                                    <Gift className="w-4 h-4 text-amber-400" />
                                    {formatPrizeStr(prize)}
                                  </span>
                                )
                              ) : (
                                <span className="text-[10px] text-slate-600 font-mono">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remaining ranking (11+) */}
              {selected.top.length > 10 && (
                <div className="rounded-2xl border border-white/8 bg-slate-900/40 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                    <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500">
                      {t('tournaments.otherParticipants')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-600">
                      {t('tournaments.remainingCount', { count: selected.top.length - 10 })}
                    </span>
                  </div>
                  <ul className="divide-y divide-white/[0.04]">
                    {selected.top.slice(10).map((entry, idx) => {
                      const rank = idx + 11;
                      const myRank = selected.myRankLive ?? selected.myEntry?.rank ?? null;
                      const isMe = myRank != null && rank === myRank;
                      return (
                        <li
                          key={entry.id}
                          className={`flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.03] transition-colors ${
                            isMe ? 'bg-sky-500/8' : ''
                          }`}
                        >
                          <span className="shrink-0 w-7 text-right font-mono text-[11px] font-bold text-slate-500">
                            {rank}
                          </span>
                          <div className="shrink-0 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] font-bold text-white">
                            {(entry.user.name || entry.user.username).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-slate-300">
                              {entry.user.name || entry.user.username}
                              {isMe && <span className="ml-1.5 text-[10px] text-sky-400 font-mono">(you)</span>}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-xs text-amber-300/80 font-bold">
                            {formatScore(entry.score, selected.tournament.metric)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {loadingList && tournaments.length === 0 && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      )}

      {!loadingList && tournaments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Trophy className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-400 font-semibold">{t('tournaments.empty.noTournaments')}</p>
          <p className="text-xs text-slate-600 mt-1">{t('tournaments.empty.newAppear')}</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">{t('tournaments.upcoming')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((tn) => (
              <TournamentCard
                key={tn.id}
                tournament={tn}
                onOpen={() => setSelectedId(tn.id)}
              />
            ))}
          </div>
        </section>
      )}

      <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="tournaments-bottom" />
    </div>
  );
}

function TournamentCard({
  tournament: tn,
  onOpen,
}: {
  tournament: TournamentSummary;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const topPrize = tn.prizes.find((p) => p.rankFrom === 1);

  return (
    <button
      onClick={onOpen}
      className="group text-left rounded-2xl border border-white/8 bg-slate-900/50 p-5 hover:border-sky-500/30 hover:bg-slate-900/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/8"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${TYPE_COLOR[tn.type]}`}>
          {t(`tournaments.types.${tn.type}`)}
        </span>
        {tn.status === 'ACTIVE' && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t('tournaments.status.LIVE')}
          </span>
        )}
      </div>

      <h3 className="font-bold text-white mb-1 text-sm leading-snug">{tn.name}</h3>

      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mb-3">
        <Zap className="h-3 w-3" />
        {t(`tournaments.metrics.${tn.metric}`)}
        <span className="text-slate-700">·</span>
        <Users className="h-3 w-3" />
        {tn._count.entries}
      </div>

      <CountdownBadge endsAt={tn.endsAt} status={tn.status} />

      {topPrize && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Gift className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400">1st: <span className="text-amber-300 font-semibold">{formatPrizeStr(topPrize)}</span></span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-1 text-xs text-sky-400 group-hover:gap-2 transition-all">
        {t('tournaments.viewDetails')} <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
