import { useState, useEffect, useCallback, useMemo } from 'react';
import { Flame, Loader2, CheckCircle2, XCircle, Cpu, ChevronLeft, RefreshCw } from 'lucide-react';
import { api } from '../../store/auth';
import { toast } from 'sonner';

interface RewardMiner {
  id: number;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  slotSize: number;
  tier?: string;
}

interface BurnEvent {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  requiredHashRate: number;
  claimLimitPerUser: number;
  stockTotal: number | null;
  stockClaimed: number;
  startsAt: string | null;
  endsAt: string | null;
  rewardMiner: RewardMiner;
  userClaimsCount: number;
  userCanClaim: boolean;
}

interface BurnableMachine {
  id: number;
  location: 'INVENTORY' | 'RACK';
  minerName: string;
  hashRate: number;
  slotSize: number;
  imageUrl: string | null;
  level: number;
}

function formatHashRate(v: number): string {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} H/s`;
}

function EventCard({ event, onOpen }: { event: BurnEvent; onOpen: () => void }) {
  const stockLabel = event.stockTotal == null
    ? 'sem limite'
    : `${Math.max(event.stockTotal - event.stockClaimed, 0)} disponíveis`;
  return (
    <button onClick={onOpen}
      disabled={!event.userCanClaim}
      className="w-full rounded-2xl border border-white/10 bg-slate-900/60 hover:bg-slate-900 transition-colors p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {event.rewardMiner.imageUrl ? (
            <img src={event.rewardMiner.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover bg-slate-800" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center">
              <Cpu className="w-7 h-7 text-slate-600" />
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
            <Flame className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-sm truncate">{event.title}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Prêmio: <span className="text-emerald-400 font-bold">{event.rewardMiner.name}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Queime ≥ <span className="text-orange-400 font-bold">{formatHashRate(event.requiredHashRate)}</span> · {stockLabel}
          </p>
          {!event.userCanClaim && (
            <p className="text-[10px] text-amber-400 mt-1">Você já atingiu o limite ({event.claimLimitPerUser}).</p>
          )}
        </div>
      </div>
    </button>
  );
}

function EventDetail({ event, onClose, onClaimed }: { event: BurnEvent; onClose: () => void; onClaimed: () => void }) {
  const [machines, setMachines] = useState<BurnableMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; machines: BurnableMachine[] }>('/burn-events/my-machines');
      setMachines(res.data.machines);
    } catch {
      toast.error('Erro ao carregar suas máquinas.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalSelectedHashRate = useMemo(() =>
    machines.filter((m) => selected.has(m.id)).reduce((s, m) => s + m.hashRate, 0)
  , [machines, selected]);

  const canClaim = totalSelectedHashRate >= event.requiredHashRate && selected.size > 0;
  const progress = Math.min(100, (totalSelectedHashRate / event.requiredHashRate) * 100);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/burn-events/${event.id}/claim`, { minerIds: Array.from(selected) });
      toast.success(`Máquinas queimadas! "${event.rewardMiner.name}" foi pro seu inbox de recompensas.`);
      onClaimed();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Erro ao queimar.';
      const code = e?.response?.data?.code ?? '';
      toast.error(code ? `${code}: ${msg}` : msg);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const selectedMachines = machines.filter((m) => selected.has(m.id));

  return (
    <div className="space-y-5">
      <button onClick={onClose}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-orange-900/30 to-slate-900 p-5">
        <div className="flex items-center gap-4">
          {event.rewardMiner.imageUrl && (
            <img src={event.rewardMiner.imageUrl} alt="" className="w-20 h-20 rounded-2xl object-cover bg-slate-800" />
          )}
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-orange-400 font-mono">Prêmio</p>
            <p className="text-xl font-black text-white">{event.rewardMiner.name}</p>
            <p className="text-xs text-emerald-400 mt-0.5">{formatHashRate(event.rewardMiner.baseHashRate)}</p>
          </div>
        </div>
        <p className="text-sm font-black text-white mt-4">{event.title}</p>
        {event.description && <p className="text-xs text-slate-400 mt-1">{event.description}</p>}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Progresso</span>
          <span className={`text-xs font-black ${canClaim ? 'text-emerald-400' : 'text-orange-400'}`}>
            {formatHashRate(totalSelectedHashRate)} / {formatHashRate(event.requiredHashRate)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className={`h-full transition-all ${canClaim ? 'bg-emerald-500' : 'bg-orange-500'}`}
            style={{ width: `${progress}%` }} />
        </div>
        <button onClick={() => setConfirming(true)} disabled={!canClaim || submitting}
          className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm transition-colors">
          <Flame className="h-4 w-4" />
          Queimar {selected.size} máquina{selected.size !== 1 ? 's' : ''} e resgatar
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-mono">Suas máquinas</p>
          <button onClick={() => void load()} className="text-slate-500 hover:text-white">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
        ) : machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <Cpu className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Você não tem máquinas no inventário ou rack.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {machines.map((m) => {
              const isSel = selected.has(m.id);
              return (
                <button key={m.id} onClick={() => toggle(m.id)}
                  className={`text-left rounded-xl border p-3 flex items-center gap-3 transition-colors ${isSel ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-slate-900/40 hover:bg-slate-900'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center ${isSel ? 'border-orange-500 bg-orange-500' : 'border-slate-600'}`}>
                    {isSel && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-800 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                      <Cpu className="w-5 h-5 text-slate-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.minerName}</p>
                    <p className="text-[10px] text-slate-500">
                      {formatHashRate(m.hashRate)} · {m.location === 'RACK' ? 'No rack' : 'Inventário'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !submitting && setConfirming(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-slate-900 border border-red-500/30 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Flame className="w-5 h-5 text-red-400" />
              </div>
              <p className="font-black text-white text-lg">Confirmar queima</p>
            </div>
            <p className="text-sm text-slate-300">
              Você vai <span className="text-red-400 font-black">DESTRUIR</span> as máquinas abaixo. Esta ação é
              <span className="text-red-400 font-black"> irreversível</span>.
            </p>
            <div className="rounded-xl bg-slate-800/60 p-3 max-h-40 overflow-y-auto space-y-1">
              {selectedMachines.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 truncate mr-2">{m.minerName}</span>
                  <span className="text-slate-500 shrink-0">{formatHashRate(m.hashRate)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs">
              <p className="text-emerald-400 font-bold">Você vai receber:</p>
              <p className="text-white font-black mt-1">{event.rewardMiner.name}</p>
              <p className="text-slate-400 mt-0.5">A máquina vai para o seu inbox de recompensas.</p>
            </div>
            <div className="flex gap-2">
              <button disabled={submitting} onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-slate-300 hover:bg-white/5 transition-colors">
                Cancelar
              </button>
              <button disabled={submitting} onClick={() => void submit()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-black text-sm transition-colors">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                Queimar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BurnEventsPage() {
  const [events, setEvents] = useState<BurnEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BurnEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; events: BurnEvent[] }>('/burn-events');
      setEvents(res.data.events);
    } catch {
      toast.error('Erro ao carregar eventos.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (selected) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <EventDetail event={selected} onClose={() => setSelected(null)} onClaimed={() => { setSelected(null); void load(); }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
          <Flame className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white">Queima</h1>
          <p className="text-xs text-slate-500">Queime máquinas pra ganhar uma máquina melhor.</p>
        </div>
        <button onClick={() => void load()} className="ml-auto p-2 rounded-xl bg-slate-800/60 text-slate-400 hover:text-white">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <Flame className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm font-bold">Nenhum evento de queima ativo.</p>
          <p className="text-xs mt-1">Volte mais tarde — novos eventos aparecem aqui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => <EventCard key={e.id} event={e} onOpen={() => setSelected(e)} />)}
        </div>
      )}
    </div>
  );
}
