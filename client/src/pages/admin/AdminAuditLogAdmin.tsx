import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../store/auth';

interface AuditRow {
  id: string;
  adminId: number | null;
  adminEmail: string | null;
  action: string;
  module: string | null;
  resource: string | null;
  resourceId: string | null;
  success: boolean;
  errorMsg: string | null;
  ipAddress: string | null;
  durationMs: number | null;
  createdAt: string;
  admin: { name: string; email: string } | null;
}

interface AuditResponse {
  ok: boolean;
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AdminAuditLogAdmin() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ action: '', module: '', success: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (filter.action) params.set('action', filter.action);
      if (filter.module) params.set('module', filter.module);
      if (filter.success === 'true') params.set('success', 'true');
      if (filter.success === 'false') params.set('success', 'false');
      const res = await api.get<AuditResponse>(`/admin/admin-audit?${params}`);
      setData(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Admin Audit Log</h1>
            {data && <p className="text-[11px] text-gray-500">{data.total} events</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Filter action..."
            value={filter.action}
            onChange={(e) => { setFilter((f) => ({ ...f, action: e.target.value })); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none w-40"
          />
          <input
            placeholder="Filter module..."
            value={filter.module}
            onChange={(e) => { setFilter((f) => ({ ...f, module: e.target.value })); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none w-36"
          />
          <select
            value={filter.success}
            onChange={(e) => { setFilter((f) => ({ ...f, success: e.target.value })); setPage(1); }}
            className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
          >
            <option value="">All</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Loading...</div>
        ) : !data?.rows.length ? (
          <p className="text-center py-8 text-gray-500 text-sm">No audit events found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-white/5">
                  <th className="text-left px-5 py-3">Time</th>
                  <th className="text-left px-4 py-3">Admin</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Module</th>
                  <th className="text-left px-4 py-3">Resource</th>
                  <th className="text-left px-4 py-3">IP</th>
                  <th className="text-center px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{r.admin?.name ?? r.adminEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-white font-medium text-xs">{r.action}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.module ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.resource ? `${r.resource}${r.resourceId ? ` #${r.resourceId}` : ''}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.ipAddress ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {r.success
                        ? <span className="text-[10px] font-black text-green-400">OK</span>
                        : <span className="text-[10px] font-black text-red-400">FAIL</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-white/5">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500">{page} / {data.totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
