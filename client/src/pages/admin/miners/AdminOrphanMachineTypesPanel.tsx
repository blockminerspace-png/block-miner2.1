import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Link2, RefreshCw, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchOrphanMachineTypes,
  relinkAllOrphanCatalogMatches,
  relinkOrphanToCatalog,
  repairOrphanEventType,
  type OrphanRelinkResult,
} from './adminMiners.orphan.api';

type OrphanType = {
  minerName: string;
  totalCount: number;
  inventoryCount: number;
  kind: 'orphan' | 'event' | 'generic';
  eventMinerId: number | null;
  catalogMinerId: number | null;
  catalogMinerName: string | null;
  hint: string;
};

export function AdminOrphanMachineTypesPanel() {
  const [types, setTypes] = useState<OrphanType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrphanMachineTypes();
      if (data?.ok && Array.isArray(data.types)) {
        setTypes(data.types as OrphanType[]);
      } else {
        setTypes([]);
      }
    } catch {
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRelinkCatalog = async (minerName: string) => {
    setBusyName(minerName);
    try {
      const result = await relinkOrphanToCatalog(minerName);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await load();
    } catch {
      toast.error('Falha ao ligar ao catálogo.');
    } finally {
      setBusyName(null);
    }
  };

  const handleRepairEvent = async (minerName: string) => {
    setBusyName(minerName);
    try {
      const result = await repairOrphanEventType(minerName);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await load();
    } catch {
      toast.error('Falha ao reparar evento.');
    } finally {
      setBusyName(null);
    }
  };

  const handleRelinkAll = async () => {
    setBatchBusy(true);
    try {
      const batch = await relinkAllOrphanCatalogMatches();
      if (batch.ok) {
        toast.success(`Reparo em lote: ${batch.linked} tipo(s) ligado(s), ${batch.skipped} ignorado(s).`);
      } else {
        toast.error('Falha no reparo em lote.');
      }
      await load();
    } catch {
      toast.error('Falha no reparo em lote.');
    } finally {
      setBatchBusy(false);
    }
  };

  if (loading || types.length === 0) return null;

  const top = types.slice(0, 20);
  const totalInstances = types.reduce((s, t) => s + t.totalCount, 0);
  const catalogLinkable = types.filter((t) => t.catalogMinerId != null).length;

  return (
    <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 text-left"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black uppercase tracking-wide text-amber-200">
            Instâncias fora do catálogo ({types.length} tipos · {totalInstances} máquinas)
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
            Estes nomes aparecem no inventário dos jogadores mas não estão ligados ao catálogo Miners. Use
            reparar para associar <code className="text-amber-200">miner_id</code> e sincronizar imagens.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase text-amber-400">{open ? 'Ocultar' : 'Ver'}</span>
      </button>

      {open ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={batchBusy || catalogLinkable === 0}
              onClick={() => void handleRelinkAll()}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-300 disabled:opacity-40"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {batchBusy ? 'Reparando…' : `Ligar todos ao catálogo (${catalogLinkable})`}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Atualizar lista
            </button>
          </div>

          <div className="mt-4 max-h-80 overflow-y-auto rounded-2xl border border-amber-500/20 bg-slate-950/80">
            <table className="w-full text-left text-xs text-slate-400">
              <thead className="sticky top-0 bg-slate-900 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nome no inventário</th>
                  <th className="px-3 py-2">Qtd</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {top.map((t) => {
                  const busy = busyName === t.minerName;
                  return (
                    <tr key={t.minerName} className="align-top hover:bg-slate-800/40">
                      <td className="px-3 py-2">
                        <p className="font-medium text-white">{t.minerName}</p>
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">{t.hint}</p>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-amber-300">{t.totalCount}</td>
                      <td className="px-3 py-2 uppercase text-[10px] font-bold text-slate-500">{t.kind}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1.5">
                          {t.catalogMinerId ? (
                            <button
                              type="button"
                              disabled={busy || batchBusy}
                              onClick={() => void handleRelinkCatalog(t.minerName)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-2 py-1.5 text-[10px] font-bold uppercase text-emerald-300 disabled:opacity-50"
                            >
                              <Link2 className="h-3 w-3" aria-hidden />
                              {busy ? '…' : `Ligar #${t.catalogMinerId}`}
                            </button>
                          ) : null}
                          {t.kind === 'event' && t.eventMinerId ? (
                            <button
                              type="button"
                              disabled={busy || batchBusy}
                              onClick={() => void handleRepairEvent(t.minerName)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-600/40 bg-amber-600/10 px-2 py-1.5 text-[10px] font-bold uppercase text-amber-200 disabled:opacity-50"
                            >
                              <Wrench className="h-3 w-3" aria-hidden />
                              {busy ? '…' : 'Sync evento'}
                            </button>
                          ) : null}
                          {!t.catalogMinerId && t.kind !== 'event' ? (
                            <span className="text-[10px] text-slate-600">Sem match no catálogo</span>
                          ) : null}
                        </div>
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
