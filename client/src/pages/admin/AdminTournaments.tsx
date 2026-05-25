import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Trophy,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Users,
  Trash2,
  Play,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const adminApi = axios.create({ baseURL: '/', withCredentials: true });

// ─── Types ────────────────────────────────────────────────────────────────────

interface Prize {
  rankFrom: number;
  rankTo: number;
  prizeType: 'POL' | 'BLK' | 'MINING_BOOST' | 'MACHINE';
  polAmount?: number;
  blkAmount?: number;
  boostHashRate?: number;
  boostHours?: number;
  minerId?: number;
  minerCount?: number;
}

interface Tournament {
  id: number;
  name: string;
  description?: string;
  type: string;
  metric: string;
  startsAt: string;
  endsAt: string;
  status: string;
  prizes: Array<Prize & { id: number; minerName?: string }>;
  _count: { entries: number };
}

const METRIC_OPTIONS = [
  { value: 'HASHRATE', label: 'Hashrate total' },
  { value: 'BLOCKS_MINED', label: 'Blocos minerados' },
  { value: 'CHECKINS', label: 'Check-ins' },
  { value: 'TASKS_COMPLETED', label: 'Tarefas completas' },
  { value: 'DEPOSITS_POL', label: 'POL depositado' },
];

const TYPE_OPTIONS = [
  { value: 'DAILY', label: 'Diário' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'CUSTOM', label: 'Personalizado' },
];

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'text-sky-400 bg-sky-500/10',
  ACTIVE: 'text-emerald-400 bg-emerald-500/10',
  ENDED: 'text-slate-500 bg-slate-800',
  CANCELLED: 'text-red-400 bg-red-500/10',
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Agendado',
  ACTIVE: 'Ativo',
  ENDED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Create form ──────────────────────────────────────────────────────────────

function emptyPrize(): Prize {
  return { rankFrom: 1, rankTo: 1, prizeType: 'POL', polAmount: 0 };
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('DAILY');
  const [metric, setMetric] = useState<string>('HASHRATE');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [prizes, setPrizes] = useState<Prize[]>([emptyPrize()]);

  const addPrize = () => setPrizes((p) => [...p, emptyPrize()]);
  const removePrize = (i: number) => setPrizes((p) => p.filter((_, idx) => idx !== i));
  const updatePrize = (i: number, patch: Partial<Prize>) =>
    setPrizes((p) => p.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await adminApi.post('/api/admin/tournaments', {
        name,
        description: description || undefined,
        type,
        metric,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        prizes,
      });
      setOpen(false);
      setName('');
      setDescription('');
      setPrizes([emptyPrize()]);
      onCreated();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Erro ao criar torneio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-white/4 transition-colors"
      >
        <Plus className="h-4 w-4 text-sky-400" />
        <span className="font-semibold text-white text-sm">Criar novo torneio</span>
        <span className="ml-auto">{open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}</span>
      </button>

      {open && (
        <form onSubmit={(e) => { void submit(e); }} className="border-t border-white/8 p-5 space-y-5">
          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
              <XCircle className="h-4 w-4 shrink-0" />
              {err}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nome do torneio *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Torneio Semanal de Hashrate"
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Descrição (opcional)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição curta"
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              >
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Métrica de ranking</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              >
                {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Início *</label>
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Fim *</label>
              <input
                required
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Prizes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-slate-400">Prêmios por posição</label>
              <button type="button" onClick={addPrize} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                <Plus className="h-3 w-3" /> Adicionar faixa
              </button>
            </div>
            <div className="space-y-3">
              {prizes.map((prize, i) => (
                <PrizeRow key={i} index={i} prize={prize} onChange={(p) => updatePrize(i, p)} onRemove={() => removePrize(i)} />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 px-5 py-2 text-sm font-bold text-white transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Criar torneio
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function PrizeRow({
  index,
  prize,
  onChange,
  onRemove,
}: {
  index: number;
  prize: Prize;
  onChange: (p: Partial<Prize>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-800/40 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Faixa {index + 1}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <label className="text-[10px] text-slate-500">Pos.</label>
          <input
            type="number" min={1} value={prize.rankFrom}
            onChange={(e) => onChange({ rankFrom: parseInt(e.target.value) })}
            className="w-14 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
          />
          <span className="text-xs text-slate-600">–</span>
          <input
            type="number" min={prize.rankFrom} value={prize.rankTo}
            onChange={(e) => onChange({ rankTo: parseInt(e.target.value) })}
            className="w-14 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
          />
          <button type="button" onClick={onRemove} className="ml-1 text-slate-600 hover:text-red-400 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] text-slate-500 mb-1">Tipo de prêmio</label>
          <select
            value={prize.prizeType}
            onChange={(e) => onChange({ prizeType: e.target.value as Prize['prizeType'] })}
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="POL">POL</option>
            <option value="BLK">BLK</option>
            <option value="MINING_BOOST">Boost de Mineração</option>
            <option value="MACHINE">Máquina</option>
          </select>
        </div>

        {prize.prizeType === 'POL' && (
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Quantidade POL</label>
            <input
              type="number" min={0} step="0.01" value={prize.polAmount ?? 0}
              onChange={(e) => onChange({ polAmount: parseFloat(e.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>
        )}

        {prize.prizeType === 'BLK' && (
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Quantidade BLK</label>
            <input
              type="number" min={0} step="0.01" value={prize.blkAmount ?? 0}
              onChange={(e) => onChange({ blkAmount: parseFloat(e.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>
        )}

        {prize.prizeType === 'MINING_BOOST' && (
          <>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">H/s boost</label>
              <input
                type="number" min={0} value={prize.boostHashRate ?? 0}
                onChange={(e) => onChange({ boostHashRate: parseFloat(e.target.value) })}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Duração (h)</label>
              <input
                type="number" min={1} value={prize.boostHours ?? 24}
                onChange={(e) => onChange({ boostHours: parseInt(e.target.value) })}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
          </>
        )}

        {prize.prizeType === 'MACHINE' && (
          <>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">ID da máquina</label>
              <input
                type="number" min={1} value={prize.minerId ?? ''}
                onChange={(e) => onChange({ minerId: parseInt(e.target.value) })}
                placeholder="ID"
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Quantidade</label>
              <input
                type="number" min={1} value={prize.minerCount ?? 1}
                onChange={(e) => onChange({ minerCount: parseInt(e.target.value) })}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tournament row ───────────────────────────────────────────────────────────

function TournamentRow({
  tournament: t,
  onRefresh,
}: {
  tournament: Tournament;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [loadingFinalize, setLoadingFinalize] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cancel = async () => {
    if (!confirm(`Cancelar "${t.name}"?`)) return;
    setLoadingCancel(true);
    try {
      await adminApi.post(`/api/admin/tournaments/${t.id}/cancel`);
      setMsg({ ok: true, text: 'Cancelado.' });
      onRefresh();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.message ?? 'Erro' });
    } finally {
      setLoadingCancel(false);
    }
  };

  const finalize = async () => {
    if (!confirm(`Finalizar "${t.name}" agora e distribuir recompensas?`)) return;
    setLoadingFinalize(true);
    try {
      const res = await adminApi.post<{ ranked: number; rewarded: number }>(`/api/admin/tournaments/${t.id}/finalize`);
      setMsg({ ok: true, text: `${res.data.ranked} rankeados, ${res.data.rewarded} recompensados.` });
      onRefresh();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.message ?? 'Erro' });
    } finally {
      setLoadingFinalize(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-900/50 overflow-hidden">
      <div
        className="flex flex-wrap items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/4 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[t.status] ?? ''}`}>
          {STATUS_LABEL[t.status] ?? t.status}
        </span>
        <span className="font-semibold text-white text-sm">{t.name}</span>
        <span className="text-[10px] text-slate-500 font-mono">{t.type} · {t.metric}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <Users className="h-3.5 w-3.5" />
          {t._count.entries}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </div>

      {expanded && (
        <div className="border-t border-white/8 px-5 py-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 text-xs text-slate-400">
            <div>
              <span className="text-slate-600 mr-2">Início:</span>
              {new Date(t.startsAt).toLocaleString('pt-BR')}
            </div>
            <div>
              <span className="text-slate-600 mr-2">Fim:</span>
              {new Date(t.endsAt).toLocaleString('pt-BR')}
            </div>
            {t.description && <div className="sm:col-span-2"><span className="text-slate-600 mr-2">Descrição:</span>{t.description}</div>}
          </div>

          {t.prizes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Prêmios</p>
              <div className="space-y-1">
                {t.prizes.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-[10px] bg-slate-800 rounded px-1.5 py-0.5">
                      #{p.rankFrom}{p.rankTo !== p.rankFrom ? `–${p.rankTo}` : ''}
                    </span>
                    <span>
                      {p.prizeType === 'POL' && `${p.polAmount} POL`}
                      {p.prizeType === 'BLK' && `${p.blkAmount} BLK`}
                      {p.prizeType === 'MINING_BOOST' && `${p.boostHashRate} H/s por ${p.boostHours}h`}
                      {p.prizeType === 'MACHINE' && `${p.minerCount}x Máquina ID#${p.minerId}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {msg && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {msg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {(t.status === 'SCHEDULED' || t.status === 'ACTIVE') && (
              <button
                onClick={(e) => { e.stopPropagation(); void cancel(); }}
                disabled={loadingCancel}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-60"
              >
                {loadingCancel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Cancelar
              </button>
            )}
            {t.status === 'ACTIVE' && (
              <button
                onClick={(e) => { e.stopPropagation(); void finalize(); }}
                disabled={loadingFinalize}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
              >
                {loadingFinalize ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Finalizar agora
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await adminApi.get<{ ok: boolean; tournaments: Tournament[] }>('/api/admin/tournaments');
      setTournaments(res.data.tournaments);
    } catch {
      setErr('Erro ao carregar torneios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = tournaments.filter((t) => t.status === 'ACTIVE');
  const scheduled = tournaments.filter((t) => t.status === 'SCHEDULED');
  const past = tournaments.filter((t) => t.status === 'ENDED' || t.status === 'CANCELLED');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-black text-white">Torneios</h1>
        </div>
        <button
          onClick={() => { void load(); }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4" />{err}
        </div>
      )}

      <CreateForm onCreated={() => { void load(); }} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <p className="text-xs uppercase tracking-widest text-emerald-400 font-mono mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Ativos ({active.length})
              </p>
              <div className="space-y-2">
                {active.map((t) => <TournamentRow key={t.id} tournament={t} onRefresh={() => { void load(); }} />)}
              </div>
            </section>
          )}

          {scheduled.length > 0 && (
            <section>
              <p className="text-xs uppercase tracking-widest text-sky-400 font-mono mb-3">Agendados ({scheduled.length})</p>
              <div className="space-y-2">
                {scheduled.map((t) => <TournamentRow key={t.id} tournament={t} onRefresh={() => { void load(); }} />)}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <p className="text-xs uppercase tracking-widest text-slate-600 font-mono mb-3">Histórico ({past.length})</p>
              <div className="space-y-2">
                {past.map((t) => <TournamentRow key={t.id} tournament={t} onRefresh={() => { void load(); }} />)}
              </div>
            </section>
          )}

          {tournaments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy className="h-10 w-10 text-slate-700 mb-3" />
              <p className="text-slate-500">Nenhum torneio criado ainda.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
