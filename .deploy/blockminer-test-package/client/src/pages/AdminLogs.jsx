import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RefreshCw, Terminal, Search, Filter } from "lucide-react";
import { api } from "../store/auth";

const PAGE_SIZE = 100;

const CATEGORY_KEYS = [
  "all",
  "auth",
  "admin",
  "economy",
  "games",
  "user_activity",
  "system",
  "other",
];

const SOURCE_KEYS = ["all", "audit_log", "audit_event"];

function categoryBadgeClass(cat) {
  switch (cat) {
    case "auth":
      return "bg-blue-500/10 text-blue-400";
    case "admin":
      return "bg-red-500/10 text-red-400";
    case "economy":
      return "bg-amber-500/10 text-amber-400";
    case "games":
      return "bg-emerald-500/10 text-emerald-400";
    case "user_activity":
      return "bg-cyan-500/10 text-cyan-400";
    case "system":
      return "bg-violet-500/10 text-violet-300";
    case "other":
      return "bg-slate-800 text-slate-300";
    default:
      return "bg-slate-800 text-slate-300";
  }
}

function formatLogDetails(log) {
  const raw = log?.details ?? log?.details_json;
  if (raw == null || raw === "") return "—";
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return String(value);
  const pairs = Object.entries(value)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return pairs.length ? pairs.join(" · ") : "—";
}

export default function AdminLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalApprox, setTotalApprox] = useState(null);
  const [matchedInWindow, setMatchedInWindow] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");

  const fetchLogs = useCallback(
    async (nextOffset = 0, append = false) => {
      try {
        setIsLoading(true);
        const res = await api.get("/admin/audit", {
          params: {
            limit: PAGE_SIZE,
            offset: nextOffset,
            category: category === "all" ? undefined : category,
            source: source === "all" ? undefined : source,
          },
        });
        if (res.data.ok) {
          const batch = res.data.logs || [];
          setLogs((prev) => (append ? [...prev, ...batch] : batch));
          setOffset(nextOffset + batch.length);
          setHasMore(Boolean(res.data.hasMore));
          if (typeof res.data.totalApprox === "number") {
            setTotalApprox(res.data.totalApprox);
          }
          if (typeof res.data.matchedInWindow === "number") {
            setMatchedInWindow(res.data.matchedInWindow);
          } else {
            setMatchedInWindow(null);
          }
        }
      } catch {
        toast.error(t("adminLogs.load_error"));
      } finally {
        setIsLoading(false);
      }
    },
    [t, category, source],
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
    const cat = String(log.category || "").toLowerCase();
    const details = formatLogDetails(log).toLowerCase();
    return (
      action.includes(q) ||
      email.includes(q) ||
      ip.includes(q) ||
      src.includes(q) ||
      rc.includes(q) ||
      cat.includes(q) ||
      details.includes(q)
    );
  });

  const loadMore = () => {
    if (!hasMore || isLoading) return;
    void fetchLogs(offset, true);
  };

  const categoryChips = useMemo(
    () =>
      CATEGORY_KEYS.map((key) => ({
        key,
        label: t(`adminLogs.category_${key}`),
        active: category === key,
      })),
    [t, category],
  );

  const sourceChips = useMemo(
    () =>
      SOURCE_KEYS.map((key) => ({
        key,
        label: t(`adminLogs.source_${key}`),
        active: source === key,
      })),
    [t, source],
  );

  const filtersActive = category !== "all" || source !== "all";

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in duration-700 sm:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Terminal className="w-6 h-6 text-purple-500" aria-hidden />
            {t("adminLogs.title")}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1 max-w-2xl">{t("adminLogs.subtitle")}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="text"
              placeholder={t("adminLogs.filter_placeholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-4 text-xs text-white transition-colors focus:border-purple-500 focus:outline-none sm:min-w-[200px]"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setOffset(0);
              void fetchLogs(0, false);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-700 sm:w-auto"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            {t("adminLogs.refresh")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 px-4 py-4 space-y-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t("adminLogs.filter_category")}</span>
          <div className="flex flex-wrap gap-2">
            {categoryChips.map(({ key, label, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${
                  active
                    ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                    : "bg-slate-950/80 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t("adminLogs.filter_source")}</span>
          <div className="flex flex-wrap gap-2">
            {sourceChips.map(({ key, label, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSource(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${
                  active
                    ? "bg-slate-700 border-slate-500 text-white"
                    : "bg-slate-950/80 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filtersActive && matchedInWindow != null ? (
          <p className="text-[10px] text-slate-500 leading-relaxed">{t("adminLogs.buffer_match_hint", { n: matchedInWindow })}</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-slate-400">
            <Filter className="w-4 h-4 shrink-0" aria-hidden />
            <span className="min-w-0 text-[10px] font-bold uppercase tracking-wide sm:tracking-widest">
              {t("adminLogs.showing_filtered", { shown: filteredLogs.length, loaded: logs.length })}
              {totalApprox != null ? ` · ${t("adminLogs.total_approx", { n: totalApprox })}` : null}
            </span>
          </div>
          {hasMore ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={loadMore}
              className="text-left text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 disabled:opacity-50 sm:text-right"
            >
              {t("adminLogs.load_more")}
            </button>
          ) : null}
        </div>
        <div className="space-y-3 p-3 lg:hidden">
          {filteredLogs.map((log) => {
            const cat = log.category && typeof log.category === "string" ? log.category : "other";
            const badgeClass = categoryBadgeClass(cat);
            const details = formatLogDetails(log);
            return (
              <article key={log.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`min-w-0 break-words rounded px-2 py-1 text-[10px] uppercase tracking-wide ${badgeClass}`}>
                      {log.action || "—"}
                    </span>
                    <span className="shrink-0 text-right text-[10px] font-mono text-slate-500">
                      {new Date(log.created_at || log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs font-medium text-slate-400">
                    <p className="min-w-0 break-words">
                      <span className="font-bold uppercase tracking-wide text-slate-600">{t("adminLogs.col_user")}: </span>
                      <span className="text-white">{log.user_email || (log.user_id != null ? `User #${log.user_id}` : "—")}</span>
                    </p>
                    <p className="min-w-0 break-words">
                      <span className="font-bold uppercase tracking-wide text-slate-600">{t("adminLogs.col_source")}: </span>
                      {log.source || "—"}
                    </p>
                    <p className="min-w-0 break-words">
                      <span className="font-bold uppercase tracking-wide text-slate-600">{t("adminLogs.col_ip")}: </span>
                      {log.ip || "—"}
                    </p>
                    <p className="min-w-0 break-words">
                      <span className="font-bold uppercase tracking-wide text-slate-600">{t("adminLogs.col_details")}: </span>
                      {details}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
          {filteredLogs.length === 0 && (
            <div className="px-4 py-12 text-center text-sm italic text-slate-600">
              {logs.length === 0 ? t("adminLogs.empty_none") : t("adminLogs.empty_filter")}
            </div>
          )}
        </div>

        <div className="hidden max-h-[600px] overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 lg:block">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-900/50 text-[10px] uppercase font-bold tracking-widest text-slate-500 sticky top-0 backdrop-blur-md">
              <tr>
                <th className="px-6 py-3">{t("adminLogs.col_time")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_source")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_event")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_user")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_ip")}</th>
                <th className="px-6 py-3">{t("adminLogs.col_details")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-medium font-mono text-xs">
              {filteredLogs.map((log) => {
                const cat = log.category && typeof log.category === "string" ? log.category : "other";
                const badgeClass = categoryBadgeClass(cat);
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
                    <td className="px-6 py-3 max-w-md truncate text-slate-400" title={formatLogDetails(log)}>
                      {formatLogDetails(log)}
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-600 italic">
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
