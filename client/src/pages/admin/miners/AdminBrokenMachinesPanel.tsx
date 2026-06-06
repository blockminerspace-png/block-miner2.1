import { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, RefreshCw, Wand2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  assignEventMinerToGroup,
  assignMinerToGroup,
  autoAssignAllBroken,
  fetchBrokenMachineGroups,
  type BrokenMachineGroup,
} from './adminMiners.repair.api';
import { repairOrphanEventType } from './adminMiners.orphan.api';
import { useAdminMinersList } from './adminMiners.hooks';

const LOCATION_LABEL: Record<string, string> = {
  RACK: 'Rack',
  INVENTORY: 'Inventário',
  WAREHOUSE: 'Cofre',
};

function groupKey(g: BrokenMachineGroup) {
  return `${g.minerName}||${g.hashRate}||${g.location}`;
}

export function AdminBrokenMachinesPanel() {
  const [groups, setGroups] = useState<BrokenMachineGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [eventPicks, setEventPicks] = useState<Record<string, string>>({});

  const { miners: catalogMiners } = useAdminMinersList({ page: 1, limit: 200, filter: 'all', sort: 'name', q: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBrokenMachineGroups();
      if (data?.ok) {
        setGroups(data.groups ?? []);
        setTotal(data.total ?? 0);
      } else {
        setGroups([]);
        setTotal(0);
      }
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAssign = async (group: BrokenMachineGroup) => {
    const key = groupKey(group);
    setBusyKey(key);
    try {
      if (group.isEvent) {
        const result = await repairOrphanEventType(group.minerName);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } else if (eventPicks[key]) {
        const result = await assignEventMinerToGroup({
          minerName: group.minerName,
          hashRate: group.hashRate,
          location: group.location,
          eventMinerId: Number(eventPicks[key]),
        });
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } else {
        const catalogId = picks[key] != null ? Number(picks[key]) : group.autoMinerId;
        if (!catalogId) { toast.error('Selecione uma mineradora do catálogo ou de evento.'); setBusyKey(null); return; }
        const result = await assignMinerToGroup({
          minerName: group.minerName,
          hashRate: group.hashRate,
          location: group.location,
          catalogMinerId: catalogId,
        });
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      }
      await load();
    } catch {
      toast.error('Falha ao atribuir mineradora.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleAutoAll = async () => {
    setAutoBusy(true);
    try {
      const result = await autoAssignAllBroken();
      if (result.ok) toast.success(result.message);
      else toast.error('Falha na atribuição automática.');
      await load();
    } catch {
      toast.error('Falha na atribuição automática.');
    } finally {
      setAutoBusy(false);
    }
  };

  if (!loading && groups.length === 0) return null;

  const autoCount = groups.filter((g) => g.autoMinerId != null).length;

  return (
    <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 text-left"
      >
        <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black uppercase tracking-wide text-red-200">
            Máquinas sem tipo ({groups.length} grupos · {total} máquinas)
          </p>
          <p className="mt-1 text-xs leading-relaxed text-red-100/70">
            Máquinas com <code className="text-red-200">miner_id = NULL</code> — sem tipo atribuído no catálogo.
            Use atribuição automática (match por H/s) ou escolha manualmente.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase text-red-400">{open ? 'Ocultar' : 'Ver'}</span>
      </button>

      {open ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={autoBusy || autoCount === 0}
              onClick={() => void handleAutoAll()}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-300 disabled:opacity-40"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden />
              {autoBusy ? 'Atribuindo…' : `Auto-atribuir por H/s (${autoCount} grupo${autoCount !== 1 ? 's' : ''})`}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Atualizar
            </button>
          </div>

          <div className="mt-4 max-h-[480px] overflow-y-auto overflow-x-auto rounded-2xl border border-red-500/20 bg-slate-950/80">
            <table className="w-full min-w-[640px] text-left text-xs text-slate-400">
              <thead className="sticky top-0 bg-slate-900 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nome atual</th>
                  <th className="px-3 py-2">H/s</th>
                  <th className="px-3 py-2">Local</th>
                  <th className="px-3 py-2">Qtd</th>
                  <th className="px-3 py-2">Atribuir a</th>
                  <th className="px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {groups.map((g) => {
                  const key = groupKey(g);
                  const busy = busyKey === key;
                  const pickedId = picks[key];
                  const effectiveId = pickedId != null ? Number(pickedId) : g.autoMinerId;
                  return (
                    <tr key={key} className="align-middle hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-medium text-white max-w-[140px] truncate">{g.minerName || <em className="text-slate-500">vazio</em>}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-300">{g.hashRate} H/s</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          g.location === 'RACK' ? 'bg-blue-900/40 text-blue-300'
                          : g.location === 'INVENTORY' ? 'bg-purple-900/40 text-purple-300'
                          : 'bg-amber-900/40 text-amber-300'
                        }`}>
                          {LOCATION_LABEL[g.location] ?? g.location}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold text-red-300">{g.count}</td>
                      <td className="px-3 py-2 min-w-[200px]">
                        {g.isEvent ? (
                          <p className="text-[10px] text-amber-300">Máquina de evento — use «Sync evento» para restaurar nome e imagem.</p>
                        ) : (
                          <>
                            {g.eventMatches.length > 0 ? (
                              <select
                                value={eventPicks[key] ?? ''}
                                onChange={(e) => setEventPicks((prev) => ({ ...prev, [key]: e.target.value }))}
                                className="mb-1 w-full rounded-lg border border-amber-600/60 bg-amber-900/20 px-2 py-1 text-xs text-amber-100 focus:border-amber-400 focus:outline-none"
                              >
                                <option value="">-- evento (mesmo H/s) --</option>
                                {g.eventMatches.map((e) => (
                                  <option key={e.id} value={String(e.id)}>
                                    [Event] #{e.id} {e.name} ({e.hashRate} H/s)
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <select
                              value={pickedId ?? (g.autoMinerId != null ? String(g.autoMinerId) : '')}
                              onChange={(e) => setPicks((prev) => ({ ...prev, [key]: e.target.value }))}
                              disabled={!!eventPicks[key]}
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none disabled:opacity-40"
                            >
                              <option value="">-- catálogo --</option>
                              {catalogMiners.map((m) => (
                                <option key={m.id} value={String(m.id)}>
                                  #{m.id} {m.name} ({m.baseHashRate} H/s)
                                </option>
                              ))}
                            </select>
                            {g.autoMinerId && !pickedId ? (
                              <p className="mt-0.5 text-[10px] text-emerald-400">✓ match automático: {g.autoMinerName}</p>
                            ) : null}
                            {g.catalogMatches.length > 1 && !pickedId ? (
                              <p className="mt-0.5 text-[10px] text-amber-400">⚠ {g.catalogMatches.length} miners com mesmo H/s — escolha manualmente</p>
                            ) : null}
                            {g.catalogMatches.length === 0 && !pickedId ? (
                              <p className="mt-0.5 text-[10px] text-red-400">✗ sem match por H/s — escolha manualmente</p>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={busy || autoBusy || (!g.isEvent && !effectiveId && !eventPicks[key])}
                          onClick={() => void handleAssign(g)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase disabled:opacity-40 ${
                            g.isEvent
                              ? 'border-amber-600/40 bg-amber-600/10 text-amber-300'
                              : 'border-emerald-600/40 bg-emerald-600/10 text-emerald-300'
                          }`}
                        >
                          <Wrench className="h-3 w-3" aria-hidden />
                          {busy ? '…' : g.isEvent ? 'Sync evento' : 'Atribuir'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
