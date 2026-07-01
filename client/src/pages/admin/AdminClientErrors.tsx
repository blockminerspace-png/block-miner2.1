import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, RefreshCw, Copy, Trash2, Loader2, CheckCircle2 } from 'lucide-react';

const adminApi = axios.create({
  baseURL: '/',
  withCredentials: true,
  xsrfCookieName: 'blockminer_csrf',
  xsrfHeaderName: 'x-csrf-token',
});

interface ClientErrorRow {
  id: number;
  action: string | null;
  severity: string | null;
  label: string;
  description: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: {
    category?: string;
    url?: string;
    stack?: string;
    componentStack?: string;
    buildId?: string;
    statusCode?: number | null;
    code?: string | null;
    operation?: string | null;
    requestId?: string | null;
  } | null;
  createdAt: string;
}

function categoryOf(r: ClientErrorRow): 'crash' | 'api_failure' {
  const m = r.metadata;
  if (m?.category === 'api_failure' || r.action === 'client_api_failure') return 'api_failure';
  return 'crash';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', { hour12: false });
  } catch {
    return iso;
  }
}

function buildClipboardText(r: ClientErrorRow): string {
  const meta = r.metadata ?? {};
  return [
    `# [${categoryOf(r)}] ${r.label}`,
    `When: ${formatTime(r.createdAt)}`,
    `Category: ${categoryOf(r)}`,
    meta.operation ? `Operation: ${meta.operation}` : null,
    meta.statusCode != null ? `StatusCode: ${meta.statusCode}` : null,
    meta.code ? `Code: ${meta.code}` : null,
    `URL: ${meta.url ?? '(unknown)'}`,
    `IP: ${r.ip ?? '(unknown)'}`,
    `User-Agent: ${r.userAgent ?? '(unknown)'}`,
    `BuildId: ${meta.buildId ?? '(unknown)'}`,
    '',
    '## Stack',
    meta.stack || r.description || '(none)',
    '',
    '## Component stack',
    meta.componentStack || '(none)',
  ].filter(Boolean).join('\n');
}

export default function AdminClientErrors() {
  const [rows, setRows] = useState<ClientErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<{ ok: boolean; items: ClientErrorRow[] }>(
        '/api/admin/client-errors',
        { params: { limit: 200 } },
      );
      setRows(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Erro ao carregar reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (r: ClientErrorRow) => {
    try {
      await navigator.clipboard.writeText(buildClipboardText(r));
      setCopiedId(r.id);
      setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 1500);
    } catch {
      /* ignore */
    }
  };

  const clearAll = async () => {
    if (!confirm('Apagar TODOS os reports de erro? Esta ação é irreversível.')) return;
    setClearing(true);
    try {
      await adminApi.delete('/api/admin/client-errors');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Erro ao limpar reports.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight text-white">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
              Erros de cliente
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Reports automáticos: <span className="text-red-300">crashes</span> (ErrorBoundary/handlers globais) +{' '}
              <span className="text-amber-300">falhas de API</span> (claims, faucet, etc.). {rows.length} eventos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
            <button
              onClick={() => void clearAll()}
              disabled={clearing || rows.length === 0}
              className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-60"
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Limpar tudo
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {rows.length === 0 && !loading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-6 py-16 text-center text-slate-500">
            Nenhum report ainda. 🎉
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const meta = r.metadata ?? {};
              return (
                <article
                  key={r.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/50 overflow-hidden"
                >
                  <header className="flex items-start gap-3 px-5 py-4 border-b border-white/5">
                    {(() => {
                      const cat = categoryOf(r);
                      const isCrash = cat === 'crash';
                      return (
                        <span
                          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            isCrash ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      );
                    })()}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(() => {
                          const cat = categoryOf(r);
                          return (
                            <span
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                cat === 'crash'
                                  ? 'bg-red-500/15 text-red-300'
                                  : 'bg-amber-500/15 text-amber-300'
                              }`}
                            >
                              {cat === 'crash' ? 'crash' : 'api failure'}
                            </span>
                          );
                        })()}
                        {meta.operation && (
                          <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                            {meta.operation}
                          </span>
                        )}
                        {meta.statusCode != null && (
                          <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                            HTTP {meta.statusCode}
                          </span>
                        )}
                        {meta.code && (
                          <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                            {meta.code}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-bold text-white break-words">{r.label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 font-mono">
                        #{r.id} · {formatTime(r.createdAt)} · {r.ip ?? '—'}
                      </p>
                    </div>
                    <button
                      onClick={() => void copy(r)}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
                    >
                      {copiedId === r.id ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copiar
                        </>
                      )}
                    </button>
                  </header>

                  <div className="px-5 py-4 space-y-3 text-xs">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">URL</p>
                        <p className="text-slate-300 break-all font-mono">{meta.url ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">User-Agent</p>
                        <p className="text-slate-300 break-words font-mono">{r.userAgent ?? '—'}</p>
                      </div>
                    </div>

                    {(meta.stack || r.description) && (
                      <details open>
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300">
                          Stack
                        </summary>
                        <pre className="mt-2 rounded-lg bg-slate-950/80 border border-white/5 p-3 text-[11px] text-red-300 whitespace-pre-wrap break-all font-mono">
                          {meta.stack || r.description}
                        </pre>
                      </details>
                    )}

                    {meta.componentStack && (
                      <details>
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300">
                          Component stack
                        </summary>
                        <pre className="mt-2 rounded-lg bg-slate-950/80 border border-white/5 p-3 text-[11px] text-slate-400 whitespace-pre-wrap break-all font-mono">
                          {meta.componentStack}
                        </pre>
                      </details>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
