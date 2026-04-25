import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Loader2, RefreshCw, Pencil } from "lucide-react";
import { api } from "../store/auth";

export default function AdminMiniPass() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/mini-pass/seasons");
      if (res.data.ok) setRows(res.data.seasons || []);
    } catch {
      toast.error(t("adminMiniPass.errors.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t("adminMiniPass.list.title")}</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-xl">{t("adminMiniPass.list.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => load()}
            className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
            aria-label={t("adminMiniPass.list.refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/mini-pass/new")}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 shrink-0" aria-hidden />
            {t("adminMiniPass.list.new_season")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/40 shadow-lg shadow-black/20">
        {loading ? (
          <div className="p-16 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" aria-hidden />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead className="bg-slate-950/80 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_id")}</th>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_slug")}</th>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_start")}</th>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_end")}</th>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_levels")}</th>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_active")}</th>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_rewards")}</th>
                  <th className="px-4 py-3">{t("adminMiniPass.list.col_missions")}</th>
                  <th className="px-4 py-3 text-right">{t("adminMiniPass.list.col_actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-300">{r.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-500/90">{r.slug}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {r.startsAt ? new Date(r.startsAt).toISOString().slice(0, 16) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {r.endsAt ? new Date(r.endsAt).toISOString().slice(0, 16) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {t("adminMiniPass.list.levels_fmt", { max: r.maxLevel, xp: r.xpPerLevel })}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{r.isActive ? t("adminMiniPass.list.yes") : t("adminMiniPass.list.no")}</td>
                    <td className="px-4 py-3 text-slate-400">{r._count?.levelRewards ?? 0}</td>
                    <td className="px-4 py-3 text-slate-400">{r._count?.missions ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/mini-pass/${r.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        {t("adminMiniPass.list.edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="p-12 text-center text-slate-500 text-sm">{t("adminMiniPass.list.empty")}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
