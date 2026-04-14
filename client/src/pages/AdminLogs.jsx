import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RefreshCw, Terminal, Search, Filter } from "lucide-react";
import { api } from "../store/auth";

const PAGE_SIZE = 100;

export default function AdminLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalApprox, setTotalApprox] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchLogs = useCallback(
    async (nextOffset = 0, append = false) => {
      try {
        setIsLoading(true);
        const res = await api.get("/admin/audit", { params: { limit: PAGE_SIZE, offset: nextOffset } });
        if (res.data.ok) {
          const batch = res.data.logs || [];
          setLogs((prev) => (append ? [...prev, ...batch] : batch));
          setOffset(nextOffset + batch.length);
          setHasMore(Boolean(res.data.hasMore));
          if (typeof res.data.totalApprox === "number") {
            setTotalApprox(res.data.totalApprox);
          }
        }
      } catch {
        toast.error(t("adminLogs.load_error"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    setOffset(0);
    void fetchLogs(0, false);
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    const action = String(log.action || "").toLowerCase();
    const email = String(log.user_email || "").toLowerCase();
    const ip = String(log.ip || "");
    const src = String(log.source || "").toLowerCase();
    const rc = String(log.result_code || "").toLowerCase();
    return (
      action.includes(q) ||
      email.includes(q) ||
      ip.includes(q) ||
      src.includes(q) ||
      rc.includes(q)
    );
  });

  const loadMore = () => {
    if (!hasMore || isLoading) return;
    void fetchLogs(offset, true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Terminal className="w-6 h-6 text-purple-500" aria-hidden />
            {t("adminLogs.title")}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1 max-w-2xl">{t("adminLogs.subtitle")}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="text"
              placeholder={t("adminLogs.filter_placeholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-purple-500 transition-colors min-w-[200px]"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setOffset(0);
              void fetchLogs(0, false);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            {t("adminLogs.refresh")}
          </button>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2 bg-slate-900">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter className="w-4 h-4 shrink-0" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {t("adminLogs.showing_filtered", { shown: filteredLogs.length, loaded: logs.length })}
              {totalApprox != null ? ` · ${t("adminLogs.total_approx", { n: totalApprox })}` : null}
            </span>
          </div>
          {hasMore ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={loadMore}
              className="text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 disabled:opacity-50"
            >
              {t("adminLogs.load_more")}
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-800">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-900/50 text-[10px] uppercase font-bold tracking-widest text-slate-500 sticky top-0 backdrop-blur-md">
              <tr>
                <th className="px-6 py-3">{t("adminLogs.col_time")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_source")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_event")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_user")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_ip")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-medium font-mono text-xs">
              {filteredLogs.map((log) => {
                const actionKey = String(log.action || "").toLowerCase();
                const badgeClass =
                  actionKey.includes("login") || actionKey.includes("auth")
                    ? "bg-blue-500/10 text-blue-400"
                    : actionKey.includes("admin") || actionKey.includes("ban")
                      ? "bg-red-500/10 text-red-400"
                      : actionKey.includes("withdraw") || actionKey.includes("deposit") || actionKey.includes("economy")
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-slate-800 text-slate-300";
                return (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at || log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{log.source || "—"}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-[10px] uppercase tracking-widest ${badgeClass}`}>
                        {log.action || "—"}
                      </span>
                      {log.result_code ? (
                        <span className="ml-2 text-[10px] text-slate-600 normal-case font-sans">{log.result_code}</span>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-white">
                      {log.user_email || (log.user_id != null ? `User #${log.user_id}` : "—")}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{log.ip || "—"}</td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-600 italic">
                    {logs.length === 0 ? t("adminLogs.empty_none") : t("adminLogs.empty_filter")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
