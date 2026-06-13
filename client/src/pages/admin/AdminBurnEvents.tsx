import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Flame,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  Power,
} from 'lucide-react';

const api = axios.create({ baseURL: '/', withCredentials: true });

interface Miner {
  id: number;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  slotSize: number;
}

interface BurnEvent {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  requiredHashRate: number;
  rewardMinerId: number;
  claimLimitPerUser: number;
  stockTotal: number | null;
  stockClaimed: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  rewardMiner: Miner;
  _count: { claims: number };
}

function CreateForm({ miners, onCreated }: { miners: Miner[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [requiredHashRate, setRequiredHashRate] = useState<number>(100);
  const [rewardMinerId, setRewardMinerId] = useState<number | ''>('');
  const [claimLimitPerUser, setClaimLimitPerUser] = useState<number>(1);
  const [stockTotal, setStockTotal] = useState<string>('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!rewardMinerId) { setErr('Selecione a máquina-prêmio.'); return; }
    setLoading(true);
    try {
      await api.post('/api/admin/burn-events', {
        title,
        description: description || undefined,
        imageUrl: imageUrl || undefined,
        requiredHashRate,
        rewardMinerId,
        claimLimitPerUser,
        stockTotal: stockTotal === '' ? null : parseInt(stockTotal, 10),
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setOpen(false);
      setTitle(''); setDescription(''); setImageUrl('');
      setRequiredHashRate(100); setRewardMinerId(''); setClaimLimitPerUser(1);
      setStockTotal(''); setStartsAt(''); setEndsAt('');
      onCreated();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Erro ao criar evento.');
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-white/4 transition-colors"
      >
        <Plus className="h-4 w-4 text-orange-400" />
        <span className="font-semibold text-white text-sm">Criar novo evento de queima</span>
        <span className="ml-auto">{open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}</span>
      </button>

      {open && (
        <form onSubmit={(e) => void submit(e)} className="border-t border-white/8 p-5 space-y-5">
          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
              <XCircle className="h-4 w-4 shrink-0" />{err}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Título *</label>
              <input
                required value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Queima de inverno"
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-orange-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Imagem (URL, opcional)</label>
              <input
                value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-orange-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Descrição (opcional)</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-orange-500/50 focus:outline-none resize-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Máquina-prêmio *</label>
              <select
                required value={rewardMinerId}
                onChange={(e) => setRewardMinerId(e.target.value ? parseInt(e.target.value, 10) : '')}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-orange-500/50 focus:outline-none"
              >
                <option value="">— escolha —</option>
                {miners.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.baseHashRate.toLocaleString('pt-BR')} H/s)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">H/s exigido (queimar ≥ este valor) *</label>
              <input
                required type="number" min={1} step="any" value={requiredHashRate}
                onChange={(e) => setRequiredHashRate(parseFloat(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-orange-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Limite por usuário</label>
              <input
                type="number" min={1} value={claimLimitPerUser}
                onChange={(e) => setClaimLimitPerUser(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-orange-500/50 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">Quantas vezes cada user pode resgatar.</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Estoque total (deixe vazio = ilimitado)</label>
              <input
                type="number" min={1} value={stockTotal}
                onChange={(e) => setStockTotal(e.target.value)}
                placeholder="ilimitado"
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-orange-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Início (opcional)</label>
              <input
                type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-orange-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Fim (opcional)</label>
              <input
                type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-orange-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 px-5 py-2 text-sm font-bold text-white transition-colors">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Criar evento
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function EventRow({ event, onChanged }: { event: BurnEvent; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await api.put(`/api/admin/burn-events/${event.id}`, { isActive: !event.isActive });
      onChanged();
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Remover evento "${event.title}"? Os claims já feitos permanecem no histórico, mas o evento some para os usuários.`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/burn-events/${event.id}`);
      onChanged();
    } finally { setBusy(false); }
  };

  const stockLabel = event.stockTotal == null
    ? `${event.stockClaimed} reclamados (sem limite)`
    : `${event.stockClaimed} / ${event.stockTotal}`;

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-900/50 p-4 flex flex-wrap items-center gap-3">
      {event.rewardMiner.imageUrl && (
        <img src={event.rewardMiner.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-800 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${event.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
            {event.isActive ? 'ATIVO' : 'PAUSADO'}
          </span>
          <span className="font-bold text-white text-sm truncate">{event.title}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Queima ≥ <span className="text-orange-400 font-bold">{event.requiredHashRate.toLocaleString('pt-BR')} H/s</span>
          {' → '}
          ganha <span className="text-emerald-400 font-bold">{event.rewardMiner.name}</span>
          {' · '}
          limite {event.claimLimitPerUser}/user
          {' · '}
          estoque {stockLabel}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Users className="h-3.5 w-3.5" />
        {event._count.claims}
      </div>
      <button onClick={toggle} disabled={busy}
        title={event.isActive ? 'Pausar' : 'Ativar'}
        className={`p-2 rounded-xl transition-colors ${event.isActive ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'}`}>
        <Power className="h-3.5 w-3.5" />
      </button>
      <button onClick={remove} disabled={busy}
        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function AdminBurnEvents() {
  const [events, setEvents] = useState<BurnEvent[]>([]);
  const [miners, setMiners] = useState<Miner[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [eRes, mRes] = await Promise.all([
        api.get<{ ok: boolean; events: BurnEvent[] }>('/api/admin/burn-events'),
        api.get<{ ok: boolean; miners?: Miner[]; data?: Miner[] }>('/api/admin/miners'),
      ]);
      setEvents(eRes.data.events);
      const list = (mRes.data as any).miners ?? (mRes.data as any).data ?? [];
      setMiners(Array.isArray(list) ? list : []);
    } catch {
      setErr('Erro ao carregar eventos ou catálogo de máquinas.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 text-orange-400" />
          <h1 className="text-xl font-black text-white">Eventos de queima</h1>
        </div>
        <button onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4" />{err}
        </div>
      )}

      <CreateForm miners={miners} onCreated={() => void load()} />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Flame className="h-10 w-10 text-slate-700 mb-3" />
          <p className="text-slate-500">Nenhum evento de queima criado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => <EventRow key={e.id} event={e} onChanged={() => void load()} />)}
        </div>
      )}
    </div>
  );
}
