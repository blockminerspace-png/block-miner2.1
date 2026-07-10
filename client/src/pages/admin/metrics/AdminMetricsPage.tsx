import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Server, Activity, MemoryStick, HardDrive, Cpu, RefreshCw, AlertCircle, Radio, Database, Layers } from 'lucide-react';
import { api } from '../../../store/auth';
import type { AdminOpsSnapshot, AdminOpsSnapshotResponse, AdminServerMetricsResponse, AdminServerMetricsSnapshot } from '../admin.types';

export default function AdminMetrics() {
    const [metrics, setMetrics] = useState<AdminServerMetricsSnapshot | null>(null);
    const [ops, setOps] = useState<AdminOpsSnapshot | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const fetchMetrics = useCallback(async () => {
        try {
            setIsLoading(true);
            const [metricsRes, opsRes] = await Promise.all([
                api.get<AdminServerMetricsResponse>('/admin/server-metrics'),
                api.get<AdminOpsSnapshotResponse>('/admin/ops/snapshot'),
            ]);
            if (metricsRes.data.ok) {
                setMetrics(metricsRes.data.metrics);
            }
            if (opsRes.data.ok) {
                setOps(opsRes.data.snapshot);
            }
        } catch {
            toast.error("Erro ao carregar métricas do servidor");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 15000);
        return () => clearInterval(interval);
    }, [fetchMetrics]);

    if (isLoading && !metrics) {
        return (
            <div className="p-8 text-slate-400 font-bold uppercase tracking-widest animate-pulse text-center py-40">
                Coletando métricas...
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="p-8 text-red-400 font-bold uppercase tracking-widest text-center py-40 flex flex-col items-center gap-4">
                <AlertCircle className="w-12 h-12 opacity-50" />
                Erro ao coletar dados do servidor
            </div>
        );
    }

    const formatBytes = (bytes: unknown): string => {
        if (bytes == null || !Number.isFinite(Number(bytes))) return '—';
        const n = Number(bytes);
        if (n < 0) return '—';
        if (n === 0) return '0 B';
        const k = 1000;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(n) / Math.log(k));
        return parseFloat((n / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const diskOk = !metrics.diskUnavailable && Number(metrics.diskTotalBytes) > 0;
    const diskPct =
        diskOk && Number.isFinite(Number(metrics.diskUsagePercent)) ? Number(metrics.diskUsagePercent) : null;

    const formatUptime = (seconds: number): string => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${d}d ${h}h ${m}m`;
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Activity className="w-6 h-6 text-emerald-500" /> Métricas do Servidor
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Status do sistema e uso de recursos em tempo real.</p>
                </div>
                <button
                    onClick={fetchMetrics}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-lg flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute -right-6 -bottom-6 opacity-5">
                        <Server className="w-32 h-32" />
                    </div>
                    <div className="flex justify-between items-start z-10">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                            <Server className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">PID: {metrics.processId || '---'}</span>
                    </div>
                    <div className="z-10 mt-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Uptime (host)</p>
                        <h3 className="text-2xl font-black text-white">{formatUptime(metrics.uptimeSeconds || 0)}</h3>
                        {metrics.processUptimeSeconds != null ? (
                            <p className="text-[10px] text-slate-500 mt-2">
                                App: <span className="font-mono text-slate-300">{formatUptime(metrics.processUptimeSeconds)}</span>
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-lg flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute -right-6 -bottom-6 opacity-5">
                        <Cpu className="w-32 h-32" />
                    </div>
                    <div className="flex justify-between items-start z-10">
                        <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <Cpu className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{metrics.cpuCores || 0} Cores</span>
                    </div>
                    <div className="z-10 mt-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Uso de CPU</p>
                        <h3 className="text-2xl font-black text-white">{(metrics.cpuUsagePercent || 0).toFixed(1)}%</h3>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-1000"
                                style={{ width: `${metrics.cpuUsagePercent || 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-lg flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute -right-6 -bottom-6 opacity-5">
                        <MemoryStick className="w-32 h-32" />
                    </div>
                    <div className="flex justify-between items-start z-10">
                        <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
                            <MemoryStick className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{formatBytes(metrics.memoryUsedBytes || 0)}</span>
                    </div>
                    <div className="z-10 mt-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Memória RAM</p>
                        <h3 className="text-2xl font-black text-white">{(metrics.memoryUsagePercent || 0).toFixed(1)}%</h3>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden">
                            <div
                                className="h-full bg-purple-500 transition-all duration-1000"
                                style={{ width: `${metrics.memoryUsagePercent || 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-lg flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute -right-6 -bottom-6 opacity-5">
                        <HardDrive className="w-32 h-32" />
                    </div>
                    <div className="flex justify-between items-start z-10">
                        <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
                            <HardDrive className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                            {diskOk ? formatBytes(metrics.diskUsedBytes) : '—'}
                        </span>
                    </div>
                    <div className="z-10 mt-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Armazenamento</p>
                        <h3 className="text-2xl font-black text-white">{diskPct != null ? `${diskPct.toFixed(1)}%` : '—'}</h3>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden">
                            <div
                                className="h-full bg-amber-500 transition-all duration-1000"
                                style={{ width: `${diskPct != null ? Math.min(100, Math.max(0, diskPct)) : 0}%` }}
                            />
                        </div>
                        {metrics.diskUnavailable ? (
                            <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
                                Disco do anfitrião indisponível neste ambiente (statfs/df falhou).
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-6">Informações do Sistema</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <InfoItem label="Plataforma" value={metrics.platform} />
                    <InfoItem label="Node.js Version" value={metrics.nodeVersion} />
                    <InfoItem label="Total RAM" value={formatBytes(metrics.memoryTotalBytes)} />
                    <InfoItem label="Total Disk" value={diskOk ? formatBytes(metrics.diskTotalBytes) : '—'} />
                </div>
            </div>

            {ops ? (
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <Radio className={`w-5 h-5 ${ops.readiness.ok ? 'text-emerald-500' : 'text-red-500'}`} />
                        <h3 className="text-lg font-bold text-white">Operações em tempo real</h3>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${ops.readiness.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                            {ops.readiness.ok ? 'READY' : 'DEGRADED'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <OpsStat label="Req/min" value={ops.http.requestsPerMinuteEstimate} />
                        <OpsStat label="Sockets" value={ops.socket.connectionsActive} />
                        <OpsStat label="Mining #" value={ops.mining.blockNumber} />
                        <OpsStat label="BullMQ wait" value={ops.queues.bullmqWaiting} />
                        <OpsStat label="Redis" value={ops.redis.connected ? 'UP' : 'DOWN'} />
                        <OpsStat label="5xx total" value={ops.http.errors5xxTotal} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><Database className="w-4 h-4" /> Health checks</h4>
                            <ul className="space-y-2 text-xs font-mono">
                                {Object.entries(ops.readiness.checks).map(([name, check]) => (
                                    <li key={name} className="flex justify-between text-slate-400">
                                        <span>{name}</span>
                                        <span className={check.ok ? 'text-emerald-400' : 'text-red-400'}>{check.ok ? 'ok' : check.message || 'fail'} ({check.latencyMs}ms)</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><Layers className="w-4 h-4" /> Economia (contadores)</h4>
                            {ops.economy.length === 0 ? (
                                <p className="text-xs text-slate-500">Sem eventos instrumentados ainda nesta sessão.</p>
                            ) : (
                                <ul className="space-y-1 text-xs font-mono max-h-48 overflow-auto">
                                    {ops.economy.slice(0, 20).map((row) => (
                                        <li key={`${row.module}-${row.action}`} className="flex justify-between text-slate-400">
                                            <span>{row.module}/{row.action}</span>
                                            <span className="text-slate-200">{row.total}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {ops.alerts.length > 0 ? (
                        <div className="bg-red-950/30 border border-red-900/50 rounded-2xl p-4">
                            <p className="text-xs font-bold text-red-300 uppercase mb-2">Alertas ativos</p>
                            <ul className="space-y-1 text-sm text-red-200">
                                {ops.alerts.map((a) => (
                                    <li key={a.id}>{a.severity}: {a.message}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

type AdminMetricsInfoItemProps = {
    label: string;
    value: string | number | null | undefined;
};

function InfoItem({ label, value }: AdminMetricsInfoItemProps) {
    return (
        <div className="border-b border-slate-800 pb-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-sm font-mono text-slate-300">{value || 'N/A'}</p>
        </div>
    );
}

function OpsStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase font-bold">{label}</p>
            <p className="text-lg font-black text-white mt-1">{value}</p>
        </div>
    );
}
