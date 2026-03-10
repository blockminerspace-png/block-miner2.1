import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Activity, RefreshCw, Terminal, Search, Filter } from 'lucide-react';
import { api } from '../store/auth';

export default function AdminLogs() {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('');

    const fetchLogs = useCallback(async () => {
        try {
            setIsLoading(true);
            // Fetching more logs for the dedicated logs page
            const res = await api.get('/admin/audit?limit=100');
            if (res.data.ok) {
                setLogs(res.data.logs || []);
            }
        } catch (err) {
            toast.error("Erro ao carregar logs do sistema");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const filteredLogs = logs.filter(log => 
        log.action.toLowerCase().includes(filter.toLowerCase()) || 
        (log.user_email && log.user_email.toLowerCase().includes(filter.toLowerCase())) ||
        (log.ip && log.ip.includes(filter))
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Terminal className="w-6 h-6 text-purple-500" /> Logs de Sistema
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Monitoramento de auditoria e ações críticas.</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input 
                            type="text" 
                            placeholder="Filtrar logs..." 
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>
                    <button 
                        onClick={fetchLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                    <div className="flex items-center gap-2 text-slate-400">
                        <Filter className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Exibindo {filteredLogs.length} registros</span>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-800">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-900/50 text-[10px] uppercase font-bold tracking-widest text-slate-500 sticky top-0 backdrop-blur-md">
                            <tr>
                                <th className="px-6 py-3">Timestamp</th>
                                <th className="px-6 py-3">Evento</th>
                                <th className="px-6 py-3">Alvo/Usuário</th>
                                <th className="px-6 py-3">Endereço IP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 font-medium font-mono text-xs">
                            {filteredLogs.map((log, i) => (
                                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-3 text-slate-500">
                                        {new Date(log.created_at || log.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-1 rounded text-[10px] uppercase tracking-widest ${
                                            log.action.includes('login') ? 'bg-blue-500/10 text-blue-400' :
                                            log.action.includes('admin') || log.action.includes('ban') ? 'bg-red-500/10 text-red-400' :
                                            log.action.includes('withdraw') ? 'bg-amber-500/10 text-amber-400' :
                                            'bg-slate-800 text-slate-300'
                                        }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-white">
                                        {log.user_email || `User #${log.user_id || log.userId}`}
                                    </td>
                                    <td className="px-6 py-3 text-slate-500">
                                        {log.ip}
                                    </td>
                                </tr>
                            ))}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-600 italic">
                                        Nenhum log corresponde ao filtro.
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
