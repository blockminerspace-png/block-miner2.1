import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Database, Download, RefreshCw, Trash2, Clock, AlertCircle, PlayCircle } from "lucide-react";
import { api } from "../store/auth";

function backupStatusKey(status) {
  if (status === "success") return "adminBackups.status_success";
  if (status === "failed") return "adminBackups.status_failed";
  if (status === "legacy_mock") return "adminBackups.status_legacy_mock";
  if (status === "legacy") return "adminBackups.status_legacy";
  return "adminBackups.status_unknown";
}

export default function AdminBackups() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.get("/admin/backups");
      if (res.data.ok) {
        setBackups(res.data.backups || []);
      }
    } catch {
      toast.error(t("adminBackups.load_error"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleCreateBackup = async () => {
    if (!window.confirm(t("adminBackups.confirm_create"))) return;

    try {
      setIsCreating(true);
      toast.info(t("adminBackups.creating"));
      const res = await api.post("/admin/backups");
      if (res.data.ok) {
        const b = res.data.backup;
        let extra = "";
        if (b && typeof b.publicTableCount === "number") {
          extra += ` (${t("adminBackups.meta_tables", { count: b.publicTableCount })})`;
        }
        if (b && typeof b.totalDataRows === "number" && typeof b.publicTablesWithRows === "number") {
          extra += ` — ${t("adminBackups.toast_row_audit", {
            rows: b.totalDataRows,
            withData: b.publicTablesWithRows,
          })}`;
        }
        if (b?.bundleName) {
          extra += ` — bundle ${b.bundleName}`;
        }
        toast.success(`${t("adminBackups.create_success")}${extra}`);
        fetchBackups();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t("adminBackups.create_error"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(t("adminBackups.confirm_delete", { name: filename }))) return;

    try {
      const res = await api.delete("/admin/backups", { data: { filename } });
      if (res.data.ok) {
        toast.success(t("adminBackups.delete_success"));
        fetchBackups();
      }
    } catch {
      toast.error(t("adminBackups.delete_error"));
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-500" aria-hidden />
            {t("adminBackups.title")}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1 max-w-2xl">{t("adminBackups.subtitle")}</p>
          <p className="text-slate-600 text-xs font-medium mt-2 max-w-3xl leading-relaxed">{t("adminBackups.subtitle_full_copy")}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={fetchBackups}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            {t("adminBackups.refresh")}
          </button>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={isCreating}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-glow disabled:opacity-50"
          >
            {isCreating ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden /> : <PlayCircle className="w-4 h-4" aria-hidden />}
            {t("adminBackups.force_backup")}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            <Clock className="w-5 h-5 text-slate-400" aria-hidden />
            {t("adminBackups.history_title")}
          </h2>
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            {t("adminBackups.file_count", { count: backups.length })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
              <tr>
                <th className="px-8 py-4">{t("adminBackups.col_file")}</th>
                <th className="px-8 py-4">{t("adminBackups.col_size")}</th>
                <th className="px-8 py-4">{t("adminBackups.col_created")}</th>
                <th className="px-8 py-4">{t("adminBackups.col_status")}</th>
                <th className="px-8 py-4 text-right">{t("adminBackups.col_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {backups.map((b) => (
                <tr key={b.name} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-blue-500 opacity-50" aria-hidden />
                      <span className="text-white font-mono text-xs">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 font-mono text-xs">{formatBytes(b.size)}</td>
                  <td className="px-8 py-5 text-xs text-slate-500">{new Date(b.created).toLocaleString()}</td>
                  <td className="px-8 py-5 text-xs">
                    <span className="text-slate-300">{t(backupStatusKey(b.status))}</span>
                    {typeof b.publicTableCount === "number" ? (
                      <div className="text-[10px] text-slate-600 mt-0.5 space-y-0.5">
                        <div>
                          {t("adminBackups.meta_tables", { count: b.publicTableCount })}
                          {typeof b.durationMs === "number" ? ` · ${t("adminBackups.meta_duration", { ms: b.durationMs })}` : null}
                        </div>
                        {typeof b.totalDataRows === "number" &&
                        typeof b.publicTablesWithRows === "number" &&
                        typeof b.publicTablesEmpty === "number" ? (
                          <div className="text-slate-500">
                            {t("adminBackups.meta_row_audit", {
                              rows: b.totalDataRows,
                              withData: b.publicTablesWithRows,
                              empty: b.publicTablesEmpty,
                            })}
                          </div>
                        ) : null}
                        {b.criticalRowCounts && typeof b.criticalRowCounts === "object" ? (
                          <div className="text-slate-600 font-mono break-all">
                            {t("adminBackups.meta_critical_counts", {
                              summary: Object.entries(b.criticalRowCounts)
                                .map(([k, v]) => `${k}:${v}`)
                                .join(" "),
                            })}
                          </div>
                        ) : null}
                        {b.bundleName ? (
                          <div className="text-sky-400">
                            Bundle: {b.bundleName}
                            {typeof b.bundleSize === "number" ? ` · ${formatBytes(b.bundleSize)}` : ""}
                          </div>
                        ) : null}
                        {Array.isArray(b.bundleIncludedPaths) && b.bundleIncludedPaths.length > 0 ? (
                          <div className="text-slate-600 break-all">
                            Snapshot: {b.bundleIncludedPaths.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex gap-2 justify-end">
                      <a
                        href={`/api/admin/backups/download?file=${encodeURIComponent(b.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                      >
                        <Download className="w-3 h-3" aria-hidden />
                        {t("adminBackups.download")}
                      </a>
                      {b.bundleName ? (
                        <a
                          href={`/api/admin/backups/download-bundle?file=${encodeURIComponent(b.bundleName)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                        >
                          <Download className="w-3 h-3" aria-hidden />
                          Bundle
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDeleteBackup(b.name)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden />
                        {t("adminBackups.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && !isLoading && (
                <tr>
                  <td colSpan="5" className="px-8 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <AlertCircle className="w-8 h-8 mb-3 opacity-50" aria-hidden />
                      <p className="italic font-medium">{t("adminBackups.empty")}</p>
                    </div>
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
