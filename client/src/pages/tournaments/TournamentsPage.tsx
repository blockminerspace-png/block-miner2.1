import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Trophy,
  Clock,
  Users,
  Medal,
  Crown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Zap,
  TrendingUp,
  CalendarDays,
  Gift,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '../../store/auth';
import { formatHashrate } from '../../shared/utils/machine';

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

const METRIC_LABEL: Record<string, string> = {
  HASHRATE: 'Hashrate',
  BLOCKS_MINED: 'Blocos Minerados',
  CHECKINS: 'Check-ins',
  TASKS_COMPLETED: 'Tarefas Completas',
  DEPOSITS_POL: 'POL Depositado',
};

const TYPE_COLOR: Record<string, string> = {
  DAILY: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  WEEKLY: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  MONTHLY: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CUSTOM: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
};

const TYPE_LABEL: Record<string, string> = {
  DAILY: 'Diário',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  CUSTOM: 'Especial',
};

function formatScore(score: number, metric: string): string {
  if (metric === 'HASHRATE') return formatHashrate(score);
  if (metric === 'DEPOSITS_POL') return `${score.toFixed(4)} POL`;
  return score.toLocaleString();
}

function formatPrize(prize: TournamentPrize): string {
  if (prize.prizeType === 'POL') return `${Number(prize.polAmount ?? 0).toFixed(2)} POL`;
  if (prize.prizeType === 'BLK') return `${Number(prize.blkAmount ?? 0).toFixed(2)} BLK`;
  if (prize.prizeType === 'MINING_BOOST')
    return `${formatHashrate(prize.boostHashRate ?? 0)} por ${prize.boostHours}h`;
  if (prize.prizeType === 'MACHINE')
    return `${prize.minerCount ?? 1}x ${prize.minerName ?? 'Máquina'}`;
  return '';
}

function CountdownBadge({ endsAt, status }: { endsAt: string; status: string }) {
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
          Começa em {h}h {m}m
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
      {h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`} restantes
    </span>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-bold text-slate-500 w-5 text-center font-mono">{rank}</span>;
}

function PrizeList({ prizes }: { prizes: TournamentPrize[] }) {
  if (prizes.length === 0) return <p className="text-xs text-slate-600">Sem prêmios definidos.</p>;
  return (
    <div className="space-y-1.5">
      {prizes.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-xs">
          <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            {p.rankFrom === p.rankTo ? `#${p.rankFrom}` : `#${p.rankFrom}–${p.rankTo}`}
          </span>
          <span className="text-slate-300">{formatPrize(p)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TournamentsPage() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [selected, setSelected] = useState<TournamentDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; tournaments: TournamentSummary[] }>('/api/tournaments');
      setTournaments(res.data.tournaments);
    } catch {
      setError('Erro ao carregar torneios.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    try {
      const res = await api.get<TournamentDetail>(`/api/tournaments/${id}`);
      setSelected(res.data);
    } catch {
      setError('Erro ao carregar detalhes.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  const active = tournaments.filter((t) => t.status === 'ACTIVE');
  const upcoming = tournaments.filter((t) => t.status === 'SCHEDULED');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
            <Trophy className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Torneios</h1>
            <p className="text-xs text-slate-500">Compete, sobe no ranking e ganhe recompensas</p>
          </div>
        </div>
        <button
          onClick={() => { void loadList(); setSelected(null); }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingList ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Detail view */}
      {selected && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Voltar
            </button>
            <span className="text-white font-bold">{selected.tournament.name}</span>
            <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${TYPE_COLOR[selected.tournament.type]}`}>
              {TYPE_LABEL[selected.tournament.type]}
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/8">
            {/* Prizes column */}
            <div className="p-5">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-slate-500 font-mono">Prêmios</p>
              <PrizeList prizes={selected.tournament.prizes} />
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Users className="h-3.5 w-3.5" />
                  {selected.tournament._count.entries} participantes
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Zap className="h-3.5 w-3.5" />
                  Métrica: {METRIC_LABEL[selected.tournament.metric] ?? selected.tournament.metric}
                </div>
                <CountdownBadge endsAt={selected.tournament.endsAt} status={selected.tournament.status} />
              </div>
              {selected.myEntry && (
                <div className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-sky-400 mb-1 font-mono">Meu resultado</p>
                  <p className="text-lg font-black text-white font-mono">
                    #{selected.myRankLive ?? selected.myEntry.rank ?? '—'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Score: {formatScore(selected.myEntry.score, selected.tournament.metric)}
                  </p>
                  {selected.myEntry.rewardGranted && (
                    <span className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Recompensa enviada ao inventário
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div className="p-5 md:col-span-2">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-slate-500 font-mono">
                Top {selected.top.length} jogadores
              </p>
              {loadingDetail ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                </div>
              ) : selected.top.length === 0 ? (
                <p className="text-sm text-slate-600 py-4 text-center">Nenhum participante ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {selected.top.map((entry, idx) => {
                    const rank = idx + 1;
                    const isMe = selected.myEntry && entry.user.id === selected.myEntry?.id;
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                          rank <= 3
                            ? 'bg-amber-500/8 border border-amber-500/15'
                            : isMe
                            ? 'bg-sky-500/8 border border-sky-500/15'
                            : 'bg-slate-800/40'
                        }`}
                      >
                        <div className="flex h-7 w-7 items-center justify-center shrink-0">
                          <RankMedal rank={rank} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {entry.user.name || entry.user.username}
                            {isMe && (
                              <span className="ml-1.5 text-[10px] text-sky-400 font-mono">(você)</span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">@{entry.user.username}</p>
                        </div>
                        <span className="shrink-0 font-mono text-sm font-bold text-slate-300">
                          {formatScore(entry.score, selected.tournament.metric)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tournament cards */}
      {!selected && (
        <>
          {loadingList ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : tournaments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Trophy className="h-12 w-12 text-slate-700 mb-4" />
              <p className="text-slate-400 font-semibold">Nenhum torneio ativo no momento.</p>
              <p className="text-xs text-slate-600 mt-1">Novos torneios aparecem aqui automaticamente.</p>
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Ao vivo</h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {active.map((t) => (
                      <TournamentCard
                        key={t.id}
                        tournament={t}
                        onOpen={() => { void loadDetail(t.id); }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {upcoming.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Em breve</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {upcoming.map((t) => (
                      <TournamentCard
                        key={t.id}
                        tournament={t}
                        onOpen={() => { void loadDetail(t.id); }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function TournamentCard({
  tournament: t,
  onOpen,
}: {
  tournament: TournamentSummary;
  onOpen: () => void;
}) {
  const topPrize = t.prizes.find((p) => p.rankFrom === 1);

  return (
    <button
      onClick={onOpen}
      className="group text-left rounded-2xl border border-white/8 bg-slate-900/50 p-5 hover:border-sky-500/30 hover:bg-slate-900/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/8"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${TYPE_COLOR[t.type]}`}>
          {TYPE_LABEL[t.type]}
        </span>
        {t.status === 'ACTIVE' && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <h3 className="font-bold text-white mb-1 text-sm leading-snug">{t.name}</h3>

      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mb-3">
        <Zap className="h-3 w-3" />
        {METRIC_LABEL[t.metric] ?? t.metric}
        <span className="text-slate-700">·</span>
        <Users className="h-3 w-3" />
        {t._count.entries}
      </div>

      <CountdownBadge endsAt={t.endsAt} status={t.status} />

      {topPrize && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Gift className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400">1º lugar: <span className="text-amber-300 font-semibold">{formatPrize(topPrize)}</span></span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-1 text-xs text-sky-400 group-hover:gap-2 transition-all">
        Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
