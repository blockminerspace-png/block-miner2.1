import { useCallback, useEffect, useState, type ChangeEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Cpu, Loader2, RefreshCw } from "lucide-react";
import { api } from "../../store/auth";
import type { AdminOfferEventListRow, AdminOfferEventsListResponse } from "./admin.types";

export default function AdminOfferEvents() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminOfferEventListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<AdminOfferEventsListResponse>("/admin/offer-events", {
        params: { page, pageSize: 20, includeDeleted: includeDeleted ? "1" : "0" },
      });
      if (res.data.ok) {
        setRows(res.data.events ?? []);
        setTotal(res.data.total ?? 0);
      }
    } catch {
      toast.error("Erro ao carregar eventos");
    } finally {
      setLoading(false);
    }
  }, [page, includeDeleted]);

  useEffect(() => {
    void load();
  }, [load]);

  const softDelete = async (id: number) => {
    if (!confirm("Arquivar este evento?")) return;
    try {
      await api.delete(`/admin/offer-events/${id}`);
      toast.success("Evento arquivado");
      void load();
    } catch {
      toast.error("Falha ao arquivar");
    }
  };

  const handleIncludeDeletedChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIncludeDeleted(event.target.checked);
  };

  const handleEditRow = (id: number) => (_event: MouseEvent<HTMLButtonElement>) => {
    navigate(`/admin/offer-events/${id}`);
  };

  const handleMinersRow = (id: number) => (_event: MouseEvent<HTMLButtonElement>) => {
    navigate(`/admin/offer-events/${id}?tab=miners`);
  };

  const handleArchiveRow = (id: number) => (_event: MouseEvent<HTMLButtonElement>) => {
    void softDelete(id);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Ofertas populares</h1>
          <p className="text-slate-500 text-sm mt-1">Eventos com miners exclusivos</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={includeDeleted} onChange={handleIncludeDeletedChange} />
            Mostrar arquivados
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/offer-events/new")}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" />
            Novo evento
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/40">
        {loading ? (
          <div className="p-16 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/80 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Início</th>
                  <th className="px-4 py-3">Fim</th>
                  <th className="px-4 py-3">Ativo</th>
                  <th className="px-4 py-3">Miners</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.id} className="text-slate-300 hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-semibold text-white">
                      {r.title}
                      {r.deletedAt && <span className="ml-2 text-[9px] text-red-400 uppercase">arquivado</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{new Date(r.startsAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs font-mono">{new Date(r.endsAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{r.isActive ? "Sim" : "Não"}</td>
                    <td className="px-4 py-3">{r.minerCount}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={handleEditRow(r.id)}
                        className="inline-flex p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-amber-400"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleMinersRow(r.id)}
                        className="inline-flex p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-amber-400"
                        title="Miners"
                      >
                        <Cpu className="w-4 h-4" />
                      </button>
                      {!r.deletedAt && (
                        <button
                          type="button"
                          onClick={handleArchiveRow(r.id)}
                          className="inline-flex p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400"
                          title="Arquivar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-600">Total: {total} evento(s)</p>
    </div>
  );
}
