import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  Repeat,
  ChevronDown,
  ChevronUp,
  Search,
  Cpu,
  Zap,
  Pencil,
  X,
  BarChart2,
} from 'lucide-react';
import {
  formatDepositRankScore,
  formatDepositRowValue,
  formatSummaryTotal,
  isDepositTournamentMetric,
  isUsdDepositRanking,
  metricLabelKey,
} from '../../shared/utils/tournamentDeposit';

const adminApi = axios.create({
  baseURL: '/',
  withCredentials: true,
  xsrfCookieName: 'blockminer_csrf',
  xsrfHeaderName: 'x-csrf-token',
});

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
  recurring: boolean;
  prizes: Array<Prize & { id: number; minerName?: string }>;
  _count: { entries: number };
}

interface AdminMinerOption {
  id: number;
  name: string;
  imageUrl?: string | null;
  hashRate?: string | number | null;
  baseHashRate?: string | number | null;
}

function formatHashRate(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0 H/s';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MH/s`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)} KH/s`;
  return `${n} H/s`;
}

function useAdminMinersList(enabled: boolean) {
  const [miners, setMiners] = useState<AdminMinerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const { t } = useTranslation();
  useEffect(() => {
    if (!enabled || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setLoading(true);
    adminApi
      .get<{ miners: AdminMinerOption[] }>('/api/admin/miners', { params: { limit: 100, sort: 'name' } })
      .then((res) => {
        if (cancelled) return;
        setMiners(Array.isArray(res.data?.miners) ? res.data.miners : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.response?.data?.message ?? t('tournaments.admin.noMachines'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, t]);
  return { miners, loading, error };
}

function MachinePicker({
  value,
  miners,
  loading,
  onSelect,
}: {
  value?: number;
  miners: AdminMinerOption[];
  loading: boolean;
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = useMemo(() => miners.find((m) => m.id === value) ?? null, [miners, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return miners;
    return miners.filter((m) => m.name.toLowerCase().includes(q) || String(m.id).includes(q));
  }, [miners, query]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-left text-xs text-white hover:border-sky-500/40 focus:outline-none"
      >
        {selected ? (
          <>
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" className="h-6 w-6 rounded object-cover bg-slate-900 shrink-0" />
            ) : (
              <span className="grid h-6 w-6 place-items-center rounded bg-slate-900 text-slate-500 shrink-0">
                <Cpu className="h-3 w-3" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-semibold">{selected.name}</span>
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
              <Zap className="h-3 w-3" />
              {formatHashRate(selected.hashRate ?? selected.baseHashRate)}
            </span>
          </>
        ) : (
          <span className="flex-1 text-slate-500">{loading ? t('tournaments.admin.loadingMachines') : t('tournaments.admin.selectMachine')}</span>
        )}
        <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-[min(22rem,90vw)] left-0 rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tournaments.admin.searchPlaceholder')}
              className="w-full bg-transparent text-xs text-white placeholder:text-slate-600 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">{t('tournaments.admin.noMachines')}</div>
            )}
            {filtered.map((m) => {
              const isSelected = m.id === value;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelect(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors ${isSelected ? 'bg-sky-500/10' : ''}`}
                >
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt="" className="h-8 w-8 rounded object-cover bg-slate-800 shrink-0" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded bg-slate-800 text-slate-500 shrink-0">
                      <Cpu className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{m.name}</div>
                    <div className="text-[10px] font-mono text-slate-500">#{m.id}</div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                    <Zap className="h-3 w-3" />
                    {formatHashRate(m.hashRate ?? m.baseHashRate)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const METRIC_OPTIONS = [
  { value: 'HASHRATE', key: 'tournaments.metrics.HASHRATE' },
  { value: 'BLOCKS_MINED', key: 'tournaments.metrics.BLOCKS_MINED' },
  { value: 'CHECKINS', key: 'tournaments.metrics.CHECKINS' },
  { value: 'TASKS_COMPLETED', key: 'tournaments.metrics.TASKS_COMPLETED' },
  { value: 'DEPOSITS_USD', key: 'tournaments.metrics.DEPOSITS_USD' },
  { value: 'DEPOSITS_POL', key: 'tournaments.metrics.DEPOSITS_POL_LEGACY' },
  { value: 'OFFERS_INTERNAL', key: 'tournaments.metrics.OFFERS_INTERNAL' },
  { value: 'OFFERS_EXTERNAL', key: 'tournaments.metrics.OFFERS_EXTERNAL' },
  { value: 'OFFERS_ALL', key: 'tournaments.metrics.OFFERS_ALL' },
];

const TYPE_OPTIONS = [
  { value: 'DAILY', key: 'tournaments.types.DAILY' },
  { value: 'WEEKLY', key: 'tournaments.types.WEEKLY' },
  { value: 'MONTHLY', key: 'tournaments.types.MONTHLY' },
  { value: 'CUSTOM', key: 'tournaments.types.CUSTOM' },
];

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'text-sky-400 bg-sky-500/10',
  ACTIVE: 'text-emerald-400 bg-emerald-500/10',
  ENDED: 'text-slate-500 bg-slate-800',
  CANCELLED: 'text-red-400 bg-red-500/10',
};

function typeDurationLabel(type: string, t: (key: string) => string): string {
  if (type === 'DAILY') return t('tournaments.duration_day');
  if (type === 'WEEKLY') return t('tournaments.duration_week');
  return t('tournaments.duration_month');
}

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Create form ──────────────────────────────────────────────────────────────

function emptyPrize(): Prize {
  return { rankFrom: 1, rankTo: 1, prizeType: 'POL', polAmount: 0 };
}

function sanitizePrizes(prizes: Prize[]) {
  return prizes.map((p) => {
    const base = { rankFrom: p.rankFrom, rankTo: p.rankTo, prizeType: p.prizeType };
    if (p.prizeType === 'POL') return { ...base, polAmount: p.polAmount ?? 0 };
    if (p.prizeType === 'BLK') return { ...base, blkAmount: p.blkAmount ?? 0 };
    if (p.prizeType === 'MINING_BOOST') return { ...base, boostHashRate: p.boostHashRate ?? 0, boostHours: p.boostHours ?? 0 };
    // MACHINE
    return { ...base, minerId: p.minerId ?? null, minerCount: p.minerCount ?? 1 };
  });
}

function DisplayOrderPanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await adminApi.get<{ ok: boolean; typeOrder: string[] }>('/api/admin/tournaments/display-order');
        setOrder(r.data.typeOrder);
      } catch {
        setOrder(['MONTHLY', 'WEEKLY', 'DAILY', 'CUSTOM']);
      }
    })();
  }, []);

  if (!order) return null;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.patch('/api/admin/tournaments/display-order', { typeOrder: order });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/8 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-slate-400 font-mono">{t('tournaments.admin.displayOrder')}</p>
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={saving}
          className="rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5"
        >
          {saving ? t('tournaments.admin.saving') : t('tournaments.admin.saveChanges')}
        </button>
      </div>
      <ul className="space-y-1.5">
        {order.map((tp, i) => (
          <li key={tp} className="flex items-center gap-2 rounded-xl border border-white/8 bg-slate-800/40 px-3 py-2">
            <span className="text-[10px] font-mono text-slate-500 w-5">#{i + 1}</span>
            <span className="text-sm text-slate-200 flex-1">{t(`tournaments.types.${tp}`)}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-md border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5 disabled:opacity-30">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded-md border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5 disabled:opacity-30">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('DAILY');
  const [metric, setMetric] = useState<string>('HASHRATE');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [prizes, setPrizes] = useState<Prize[]>([emptyPrize()]);

  const { miners, loading: minersLoading } = useAdminMinersList(open);

  const addPrize = () => setPrizes((p) => [...p, emptyPrize()]);
  const removePrize = (i: number) => setPrizes((p) => p.filter((_, idx) => idx !== i));
  const updatePrize = (i: number, patch: Partial<Prize>) =>
    setPrizes((p) => p.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const auto = recurring && isAutoSchedulable(type);
      const effectiveStartsAt = recurring && !startsAt ? new Date() : new Date(startsAt);
      const effectiveEndsAt = auto
        ? computeAutoEnd(effectiveStartsAt, type)
        : new Date(endsAt);
      await adminApi.post('/api/admin/tournaments', {
        name,
        description: description || undefined,
        type,
        metric,
        startsAt: effectiveStartsAt.toISOString(),
        endsAt: effectiveEndsAt.toISOString(),
        recurring,
        prizes: sanitizePrizes(prizes),
      });
      setOpen(false);
      setName('');
      setDescription('');
      setRecurring(false);
      setPrizes([emptyPrize()]);
      onCreated();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? t('tournaments.errors.loadList'));
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
        <span className="font-semibold text-white text-sm">{t('tournaments.admin.createNew')}</span>
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
              <label className="block text-xs text-slate-400 mb-1.5">{t('tournaments.admin.name')}</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('tournaments.admin.namePlaceholder')}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{t('tournaments.admin.description')}</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('tournaments.admin.descriptionPlaceholder')}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{t('tournaments.admin.type')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              >
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{t('tournaments.admin.metric')}</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              >
                {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
              </select>
              {isDepositTournamentMetric(metric) && (
                <p className="mt-1.5 text-[10px] text-amber-300/90">{t('tournaments.admin.metricDepositHint')}</p>
              )}
            </div>
          </div>

          {recurring && isAutoSchedulable(type) ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
              <p className="font-bold">{t('tournaments.admin.autoScheduling')}</p>
              <p className="mt-1 text-emerald-200/80">
                {t('tournaments.admin.autoSchedulingDesc', {
                  type: t(`tournaments.types.${type}`),
                  duration: typeDurationLabel(type, t),
                })}
              </p>
            </div>
          ) : (
          <div className={`grid gap-4 ${recurring ? '' : 'sm:grid-cols-2'}`}>
            {!recurring && (
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">{t('tournaments.admin.startDate')}</label>
                <input
                  required={!recurring}
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {recurring ? t('tournaments.admin.endOfFirstCycle') : t('tournaments.admin.endDate')}
              </label>
              <input
                required
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              />
              {recurring && (
                <p className="mt-1 text-[10px] text-slate-500">
                  {t('tournaments.admin.autoStart')}
                </p>
              )}
            </div>
          </div>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 cursor-pointer hover:bg-amber-500/10 transition-colors">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-amber-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                <Repeat className="h-3.5 w-3.5" />
                {t('tournaments.admin.recurring')}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {t('tournaments.admin.recurringDesc')}
              </p>
            </div>
          </label>

          {/* Prizes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-slate-400">{t('tournaments.admin.prizePerPosition')}</label>
              <button type="button" onClick={addPrize} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                <Plus className="h-3 w-3" /> {t('tournaments.admin.addTier')}
              </button>
            </div>
            <div className="space-y-3">
              {prizes.map((prize, i) => (
                <PrizeRow
                  key={i}
                  index={i}
                  prize={prize}
                  onChange={(p) => updatePrize(i, p)}
                  onRemove={() => removePrize(i)}
                  miners={miners}
                  minersLoading={minersLoading}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition-colors">
              {t('tournaments.admin.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 px-5 py-2 text-sm font-bold text-white transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {t('tournaments.admin.createTournament')}
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
  miners,
  minersLoading,
}: {
  index: number;
  prize: Prize;
  onChange: (p: Partial<Prize>) => void;
  onRemove: () => void;
  miners: AdminMinerOption[];
  minersLoading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-white/8 bg-slate-800/40 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">{t('tournaments.admin.tier', { index: index + 1 })}</span>
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
          <label className="block text-[10px] text-slate-500 mb-1">{t('tournaments.admin.prizeType')}</label>
          <select
            value={prize.prizeType}
            onChange={(e) => onChange({ prizeType: e.target.value as Prize['prizeType'] })}
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="POL">POL</option>
            <option value="BLK">BLK</option>
            <option value="MINING_BOOST">{t('tournaments.admin.miningBoost')}</option>
            <option value="MACHINE">{t('tournaments.admin.machine')}</option>
          </select>
        </div>

        {prize.prizeType === 'POL' && (
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">{t('tournaments.admin.polAmount')}</label>
            <input
              type="number" min={0} step="0.01" value={prize.polAmount ?? 0}
              onChange={(e) => onChange({ polAmount: parseFloat(e.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>
        )}

        {prize.prizeType === 'BLK' && (
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">{t('tournaments.admin.blkAmount')}</label>
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
              <label className="block text-[10px] text-slate-500 mb-1">{t('tournaments.admin.boostHashRate')}</label>
              <input
                type="number" min={0} value={prize.boostHashRate ?? 0}
                onChange={(e) => onChange({ boostHashRate: parseFloat(e.target.value) })}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">{t('tournaments.admin.boostDuration')}</label>
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
            <div className="col-span-2">
              <label className="block text-[10px] text-slate-500 mb-1">{t('tournaments.admin.machine')}</label>
              <MachinePicker
                value={prize.minerId}
                miners={miners}
                loading={minersLoading}
                onSelect={(id) => onChange({ minerId: id })}
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">{t('tournaments.admin.quantity')}</label>
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

function computeAutoEnd(start: Date, type: string): Date {
  const d = new Date(start);
  if (type === 'DAILY') d.setDate(d.getDate() + 1);
  else if (type === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (type === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  return d;
}

function isAutoSchedulable(type: string): boolean {
  return type === 'DAILY' || type === 'WEEKLY' || type === 'MONTHLY';
}

function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditTournamentModal({
  tournament: t,
  onClose,
  onSaved,
}: {
  tournament: Tournament;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t: i18t } = useTranslation();
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description ?? '');
  const [type, setType] = useState(t.type);
  const [metric, setMetric] = useState(t.metric);
  const [startsAt, setStartsAt] = useState(toDateTimeLocalValue(t.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeLocalValue(t.endsAt));
  const [recurring, setRecurring] = useState(t.recurring);
  const [prizes, setPrizes] = useState<Prize[]>(
    t.prizes.map((p) => ({
      rankFrom: p.rankFrom,
      rankTo: p.rankTo,
      prizeType: p.prizeType,
      polAmount: p.polAmount ?? undefined,
      blkAmount: p.blkAmount ?? undefined,
      boostHashRate: p.boostHashRate ?? undefined,
      boostHours: p.boostHours ?? undefined,
      minerId: p.minerId ?? undefined,
      minerCount: p.minerCount ?? 1,
    })),
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { miners, loading: minersLoading } = useAdminMinersList(true);

  const addPrize = () => setPrizes((p) => [...p, emptyPrize()]);
  const removePrize = (i: number) => setPrizes((p) => p.filter((_, idx) => idx !== i));
  const updatePrize = (i: number, patch: Partial<Prize>) =>
    setPrizes((p) => p.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const auto = recurring && isAutoSchedulable(type);
      const effStart = new Date(startsAt);
      const effEnd = auto ? computeAutoEnd(effStart, type) : new Date(endsAt);
      await adminApi.patch(`/api/admin/tournaments/${t.id}`, {
        name,
        description: description || null,
        type,
        metric,
        startsAt: effStart.toISOString(),
        endsAt: effEnd.toISOString(),
        recurring,
        prizes: sanitizePrizes(prizes),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? i18t('tournaments.admin.saveChanges'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Pencil className="h-4 w-4 text-sky-400" />
            {i18t('tournaments.admin.editTournament')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={(e) => { void submit(e); }} className="overflow-y-auto p-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
              <XCircle className="h-4 w-4 shrink-0" />
              {err}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{i18t('tournaments.admin.name')}</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{i18t('tournaments.admin.description')}</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{i18t('tournaments.admin.type')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
              >
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{i18t(o.key)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{i18t('tournaments.admin.metric')}</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
              >
                {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{i18t(o.key)}</option>)}
              </select>
              {isDepositTournamentMetric(metric) && (
                <p className="mt-1.5 text-[10px] text-amber-300/90">{i18t('tournaments.admin.metricDepositHint')}</p>
              )}
            </div>
          </div>

          {recurring && isAutoSchedulable(type) ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
              <p className="font-bold">{i18t('tournaments.admin.autoScheduling')}</p>
              <p className="mt-1 text-emerald-200/80">
                {i18t('tournaments.admin.autoSchedulingDesc', {
                  type: i18t(`tournaments.types.${type}`),
                  duration: typeDurationLabel(type, i18t),
                })}
              </p>
            </div>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{i18t('tournaments.admin.startDate')}</label>
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">{i18t('tournaments.admin.endDate')}</label>
              <input
                required
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-amber-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                <Repeat className="h-3.5 w-3.5" />
                {i18t('tournaments.admin.recurring')}
              </div>
            </div>
          </label>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-slate-400">{i18t('tournaments.admin.prizePerPosition')}</label>
              <button type="button" onClick={addPrize} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                <Plus className="h-3 w-3" /> {i18t('tournaments.admin.addTier')}
              </button>
            </div>
            <div className="space-y-3">
              {prizes.map((prize, i) => (
                <PrizeRow
                  key={i}
                  index={i}
                  prize={prize}
                  onChange={(p) => updatePrize(i, p)}
                  onRemove={() => removePrize(i)}
                  miners={miners}
                  minersLoading={minersLoading}
                />
              ))}
              {prizes.length === 0 && (
                <p className="text-xs text-slate-600 italic">{i18t('tournaments.admin.noPrizesYet')}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-slate-900 -mx-5 px-5 py-3 border-t border-white/10">
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
              {i18t('tournaments.admin.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 px-5 py-2 text-sm font-bold text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {i18t('tournaments.admin.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TournamentRow({
  tournament: t,
  onRefresh,
}: {
  tournament: Tournament;
  onRefresh: () => void;
}) {
  const { t: i18t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [loadingFinalize, setLoadingFinalize] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [auditOpen, setAuditOpen] = useState(false);

  const isAuditableMetric =
    t.metric === 'DEPOSITS_POL' || t.metric === 'DEPOSITS_USD';

  const cancel = async () => {
    if (!confirm(i18t('tournaments.admin.cancelConfirm', { name: t.name }))) return;
    setLoadingCancel(true);
    try {
      await adminApi.post(`/api/admin/tournaments/${t.id}/cancel`);
      setMsg({ ok: true, text: i18t('tournaments.status.CANCELLED') });
      onRefresh();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.message ?? 'Error' });
    } finally {
      setLoadingCancel(false);
    }
  };

  const finalize = async () => {
    if (!confirm(i18t('tournaments.admin.finalizeConfirm', { name: t.name }))) return;
    setLoadingFinalize(true);
    try {
      const res = await adminApi.post<{ ranked: number; rewarded: number }>(`/api/admin/tournaments/${t.id}/finalize`);
      setMsg({ ok: true, text: i18t('tournaments.admin.rankedRewarded', { ranked: res.data.ranked, rewarded: res.data.rewarded }) });
      onRefresh();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.message ?? 'Error' });
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
          {i18t(`tournaments.status.${t.status}`)}
        </span>
        <span className="font-semibold text-white text-sm">{t.name}</span>
        <span className="text-[10px] text-slate-500 font-mono">{t.type} · {i18t(metricLabelKey(t.metric))}</span>
        {t.recurring && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-300 px-2 py-0.5 text-[10px] font-bold">
            <Repeat className="h-2.5 w-2.5" />
            {i18t('tournaments.admin.loopBadge')}
          </span>
        )}
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
              <span className="text-slate-600 mr-2">{i18t('tournaments.admin.startDate')}:</span>
              {new Date(t.startsAt).toLocaleString()}
            </div>
            <div>
              <span className="text-slate-600 mr-2">{i18t('tournaments.admin.endDate')}:</span>
              {new Date(t.endsAt).toLocaleString()}
            </div>
            {t.description && <div className="sm:col-span-2"><span className="text-slate-600 mr-2">{i18t('tournaments.admin.description')}:</span>{t.description}</div>}
          </div>

          {t.prizes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">{i18t('tournaments.prizes')}</p>
              <div className="space-y-1">
                {t.prizes.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-[10px] bg-slate-800 rounded px-1.5 py-0.5">
                      #{p.rankFrom}{p.rankTo !== p.rankFrom ? `–${p.rankTo}` : ''}
                    </span>
                    <span>
                      {p.prizeType === 'POL' && `${p.polAmount} POL`}
                      {p.prizeType === 'BLK' && `${p.blkAmount} BLK`}
                      {p.prizeType === 'MINING_BOOST' && `${p.boostHashRate} H/s / ${p.boostHours}h`}
                      {p.prizeType === 'MACHINE' && `${p.minerCount}x ${i18t('tournaments.admin.machine')} ID#${p.minerId}`}
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
            {isAuditableMetric && (
              <button
                onClick={(e) => { e.stopPropagation(); setAuditOpen(true); }}
                className="flex items-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-400 hover:bg-violet-500/20 transition-colors"
              >
                <BarChart2 className="h-3.5 w-3.5" />
                Auditoria
              </button>
            )}
            {(t.status === 'SCHEDULED' || t.status === 'ACTIVE') && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className="flex items-center gap-1.5 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                {i18t('tournaments.admin.editTournament')}
              </button>
            )}
            {(t.status === 'SCHEDULED' || t.status === 'ACTIVE') && (
              <button
                onClick={(e) => { e.stopPropagation(); void cancel(); }}
                disabled={loadingCancel}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-60"
              >
                {loadingCancel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                {i18t('tournaments.admin.cancel')}
              </button>
            )}
            {t.status === 'ACTIVE' && (
              <button
                onClick={(e) => { e.stopPropagation(); void finalize(); }}
                disabled={loadingFinalize}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
              >
                {loadingFinalize ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {i18t('tournaments.admin.finalizeNow')}
              </button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <EditTournamentModal
          tournament={t}
          onClose={() => setEditing(false)}
          onSaved={onRefresh}
        />
      )}

      {auditOpen && (
        <TournamentAuditModal tournament={t} onClose={() => setAuditOpen(false)} />
      )}
    </div>
  );
}

type AuditBreakdown = {
  internal?: number;
  offerwallMe?: number;
  zeradsRaw?: number;
  zeradsCapped?: number;
  total?: number;
  txCount?: number;
  totalPol?: number;
  totalUsd?: number;
};

type AuditEntry = {
  rank: number;
  userId: number;
  username: string;
  storedScore: number;
  breakdown: AuditBreakdown;
  mismatch: boolean;
};

function TournamentAuditModal({ tournament, onClose }: { tournament: Tournament; onClose: () => void }) {
  const { t: i18t } = useTranslation();
  const isDeposit = isDepositTournamentMetric(tournament.metric);
  const isUsdDeposit = isUsdDepositRanking(tournament.metric);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get(`/api/admin/tournaments/${tournament.id}/score-audit`);
      if (data?.ok) {
        setEntries(data.entries ?? []);
        setMeta(data);
      }
    } finally {
      setLoading(false);
    }
  }, [tournament.id]);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = async (userId: number) => {
    setDetailUserId(userId);
    setDetailLoading(true);
    try {
      const { data } = await adminApi.get(`/api/admin/tournaments/${tournament.id}/score-audit/${userId}`);
      if (data?.ok) setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  };

  const scoringConfig = meta?.scoringConfig as { zeradsMaxPerWindow?: number; zeradsMaxPerUtcDay?: number } | undefined;
  const depositSummary = meta?.depositSummary as {
    totalPol?: number;
    totalUsd?: number | null;
    txCount?: number;
    participantCount?: number;
    rankingUnit?: string;
  } | undefined;
  const tMeta = meta?.tournament as { windowUtc?: { start: string; end: string } } | undefined;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="relative w-full max-w-5xl max-h-[90vh] overflow-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Auditoria — {tournament.name}</h3>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Servidor: {String(meta?.serverNow ?? '…')} · agora UTC: {String((meta as { serverNowUtc?: string })?.serverNowUtc ?? '…')}
            </p>
            {tMeta?.windowUtc && (
              <p className="text-xs text-slate-400 mt-1">
                Janela UTC: {tMeta.windowUtc.start} → {tMeta.windowUtc.end}
              </p>
            )}
            {isDeposit && depositSummary && (
              <p className="text-xs text-emerald-300 mt-1 font-mono">
                Total janela: {depositSummary.txCount ?? 0} depósitos ·{' '}
                {formatSummaryTotal(tournament.metric, depositSummary)}{' '}
                {isUsdDeposit && depositSummary.totalPol != null && depositSummary.totalPol > 0 && (
                  <span className="text-slate-400">
                    ({depositSummary.totalPol.toFixed(4)} POL)
                  </span>
                )}{' '}
                · {depositSummary.participantCount ?? 0} participantes
              </p>
            )}
            {!isDeposit && (
              <p className="text-xs text-violet-300 mt-1">
                Zerads: cliques válidos (máx. {scoringConfig?.zeradsMaxPerUtcDay ?? scoringConfig?.zeradsMaxPerWindow ?? 100}/dia UTC)
              </p>
            )}
            {isDeposit && (
              <p className="text-xs text-amber-300/90 mt-1">
                {i18t('tournaments.admin.depositAuditNote')}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-500" /></div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider">
                {isDeposit ? (
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-right">Txs</th>
                    <th className="px-3 py-2 text-right">{isUsdDeposit ? 'Valor USD' : 'Total POL'}</th>
                    {isUsdDeposit && <th className="px-3 py-2 text-right">POL (info)</th>}
                    <th className="px-3 py-2 text-right">Gravado</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-right">Int</th>
                    <th className="px-3 py-2 text-right">OWM</th>
                    <th className="px-3 py-2 text-right">Zerads</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Gravado</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((e) => (
                  <tr
                    key={e.userId}
                    className={`cursor-pointer hover:bg-white/5 ${e.mismatch ? 'bg-red-500/10' : ''}`}
                    onClick={() => void loadDetail(e.userId)}
                  >
                    <td className="px-3 py-2 text-slate-500">{e.rank}</td>
                    <td className="px-3 py-2 text-white font-medium">{e.username} <span className="text-slate-600">#{e.userId}</span></td>
                    {isDeposit ? (
                      <>
                        <td className="px-3 py-2 text-right font-mono">{e.breakdown.txCount ?? 0}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                          {formatDepositRankScore(tournament.metric, e.breakdown.total ?? 0)}
                        </td>
                        {isUsdDeposit && (
                          <td className="px-3 py-2 text-right font-mono text-slate-400">
                            {(e.breakdown.totalPol ?? 0).toFixed(4)}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right font-mono">
                          {formatDepositRankScore(tournament.metric, e.storedScore)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${e.mismatch ? 'text-red-400' : 'text-slate-600'}`}>
                          {isUsdDeposit
                            ? (e.storedScore - (e.breakdown.total ?? 0)).toFixed(2)
                            : (e.storedScore - (e.breakdown.total ?? 0)).toFixed(4)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right font-mono">{e.breakdown.internal ?? 0}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.breakdown.offerwallMe ?? 0}</td>
                        <td className="px-3 py-2 text-right font-mono text-violet-300">
                          {e.breakdown.zeradsRaw ?? 0}→{e.breakdown.zeradsCapped ?? 0} cliques válidos
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">{e.breakdown.total ?? 0}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.storedScore}</td>
                        <td className={`px-3 py-2 text-right font-mono ${e.mismatch ? 'text-red-400' : 'text-slate-600'}`}>
                          {(e.storedScore - (e.breakdown.total ?? 0)).toFixed(0)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detailUserId != null && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/80 p-4">
            <p className="text-sm font-bold text-white mb-2">Detalhe user #{detailUserId}</p>
            {detailLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            ) : detail ? (
              isDeposit ? (
                <div className="text-[11px] font-mono text-slate-400 max-h-64 overflow-auto space-y-3">
                  <p className="text-emerald-400">
                    Total: {formatDepositRankScore(tournament.metric, Number((detail.breakdown as { total?: number })?.total ?? 0))}
                    {(detail.breakdown as { totalPol?: number })?.totalPol != null && isUsdDeposit && (
                      <span className="text-slate-400 ml-1">
                        ({((detail.breakdown as { totalPol?: number }).totalPol ?? 0).toFixed(4)} POL)
                      </span>
                    )}
                    {' · '}{(detail.breakdown as { txCount?: number })?.txCount ?? 0} txs
                    {(detail as { mismatch?: boolean }).mismatch && <span className="text-red-400 ml-2">mismatch</span>}
                  </p>
                  <table className="w-full">
                    <thead>
                      <tr className="text-slate-500 text-left">
                        <th className="py-1 pr-2">Valor</th>
                        <th className="py-1 pr-2">Creditado UTC</th>
                        <th className="py-1">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.deposits as Array<{
                        amount: number;
                        amountPol?: number;
                        usdValue?: number | null;
                        completedAt: string | null;
                        confirmedEventAt?: string | null;
                        createdAt: string;
                        txHash: string | null;
                      }> | undefined)?.map((d, i) => {
                        const amountPol = d.amountPol ?? d.amount;
                        const formatted = formatDepositRowValue(tournament.metric, d.usdValue, amountPol);
                        const credited = d.confirmedEventAt ?? d.completedAt ?? d.createdAt;
                        return (
                          <tr key={i} className="border-t border-white/5">
                            <td className="py-1 pr-2 text-white">
                              {formatted.primary}
                              {formatted.secondary ? ` (${formatted.secondary})` : ''}
                            </td>
                            <td className="py-1 pr-2">{credited.replace('T', ' ').slice(0, 19)}</td>
                            <td className="py-1 truncate max-w-[200px]">{d.txHash ? `${d.txHash.slice(0, 10)}…${d.txHash.slice(-6)}` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(detail.pendingInWindow as Array<{ amount: number; createdAt: string }> | undefined)?.length ? (
                    <p className="text-amber-400">
                      Pendentes na janela: {(detail.pendingInWindow as Array<unknown>).length} (não contam no score)
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3 text-[11px] font-mono text-slate-400 max-h-48 overflow-auto">
                  <div>
                    <p className="text-slate-500 mb-1">Internas</p>
                    {(detail.internalAttempts as Array<{ title: string; completedAt: string }> | undefined)?.map((a, i) => (
                      <div key={i} className="truncate">{a.completedAt.slice(11, 19)} {a.title}</div>
                    ))}
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">OfferwallMe</p>
                    {(detail.offerwallMe as Array<{ createdAt: string; offerName: string | null }> | undefined)?.map((a, i) => (
                      <div key={i} className="truncate">{a.createdAt.slice(11, 19)} {a.offerName ?? '—'}</div>
                    ))}
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Zerads (cliques)</p>
                    {(detail.zerads as Array<{ callbackAt: string; clicks: number }> | undefined)?.map((z, i) => (
                      <div key={i}>{z.callbackAt.slice(11, 19)} ({z.clicks} cliques)</div>
                    ))}
                  </div>
                </div>
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTournaments() {
  const { t } = useTranslation();
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
      setErr(t('tournaments.errors.loadList'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const active = tournaments.filter((t) => t.status === 'ACTIVE');
  const scheduled = tournaments.filter((t) => t.status === 'SCHEDULED');
  const past = tournaments.filter((t) => t.status === 'ENDED' || t.status === 'CANCELLED');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-black text-white">{t('tournaments.admin.title')}</h1>
        </div>
        <button
          onClick={() => { void load(); }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('tournaments.header.refresh')}
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4" />{err}
        </div>
      )}

      <DisplayOrderPanel onChanged={() => { void load(); }} />

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
                {t('tournaments.admin.activeCount', { count: active.length })}
              </p>
              <div className="space-y-2">
                {active.map((t) => <TournamentRow key={t.id} tournament={t} onRefresh={() => { void load(); }} />)}
              </div>
            </section>
          )}

          {scheduled.length > 0 && (
            <section>
              <p className="text-xs uppercase tracking-widest text-sky-400 font-mono mb-3">{t('tournaments.admin.scheduledCount', { count: scheduled.length })}</p>
              <div className="space-y-2">
                {scheduled.map((t) => <TournamentRow key={t.id} tournament={t} onRefresh={() => { void load(); }} />)}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <p className="text-xs uppercase tracking-widest text-slate-600 font-mono mb-3">{t('tournaments.admin.historyCount', { count: past.length })}</p>
              <div className="space-y-2">
                {past.map((t) => <TournamentRow key={t.id} tournament={t} onRefresh={() => { void load(); }} />)}
              </div>
            </section>
          )}

          {tournaments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy className="h-10 w-10 text-slate-700 mb-3" />
              <p className="text-slate-500">{t('tournaments.admin.noTournamentsYet')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
