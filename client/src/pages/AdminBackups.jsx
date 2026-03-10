import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
    Database, Download, RefreshCw, Trash2, Clock, CheckCircle2, AlertCircle, PlayCircle
} from 'lucide-react';
import { api } from '../store/auth';

export default function AdminBackups() {
    const [backups, setBackups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    const fetchBackups = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await api.get('/admin/backups');
            if (res.data.ok) {
                setBackups(res.data.backups || []);
            }
        } catch (err) {
            toast.error("Erro ao carregar lista de backups");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBackups();
    }, [fetchBackups]);

    const handleCreateBackup = async () => {
        if (!confirm("Isso iniciará um backup completo do banco de dados agora. Continuar?")) return;
        
        try {
            setIsCreating(true);
            toast.info("Iniciando backup manual...");
            const res = await api.post('/admin/backups');
            if (res.data.ok) {
                toast.success('Backup concluído com sucesso!');
                fetchBackups();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha ao criar backup.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteBackup = async (filename) => {
        if (!confirm(`Excluir permanentemente o backup ${filename}?`)) return;
        
        try {
            const res = await api.delete('/admin/backups', { data: { filename } });
            if (res.data.ok) {
                toast.success('Backup excluído.');
                fetchBackups();
            }
        } catch (err) {
            toast.error('Erro ao excluir backup.');
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Database className="w-6 h-6 text-blue-500" /> Sistema de Backups
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Gerencie os pontos de restauração do banco de dados.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={fetchBackups}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                    <button 
                        onClick={handleCreateBackup}
                        disabled={isCreating}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-glow disabled:opacity-50"
                    >
                        {isCreating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                        Forçar Backup
                    </button>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                    <h2 className="text-lg font-bold text-white flex items-center gap-3">
                        <Clock className="w-5 h-5 text-slate-400" /> Histórico de Snapshots
                    </h2>
                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{backups.length} Arquivos Locais</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                            <tr>
                                <th className="px-8 py-4">Arquivo de Backup</th>
                                <th className="px-8 py-4">Tamanho</th>
                                <th className="px-8 py-4">Data de Criação</th>
                                <th className="px-8 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-medium">
                            {backups.map((b) => (
                                <tr key={b.name} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <Database className="w-4 h-4 text-blue-500 opacity-50" />
                                            <span className="text-white font-mono text-xs">{b.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 font-mono text-xs">
                                        {formatBytes(b.size)}
                                    </td>
                                    <td className="px-8 py-5 text-xs text-slate-500">
                                        {new Date(b.created).toLocaleString()}
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex gap-2 justify-end">
                                            <a 
                                                href={`/api/admin/backups/download?file=${encodeURIComponent(b.name)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                            >
                                                <Download className="w-3 h-3" /> Baixar
                                            </a>
                                            <button 
                                                onClick={() => handleDeleteBackup(b.name)}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                            >
                                                <Trash2 className="w-3 h-3" /> Excluir
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {backups.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan="4" className="px-8 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-500">
                                            <AlertCircle className="w-8 h-8 mb-3 opacity-50" />
                                            <p className="italic font-medium">Nenhum backup encontrado no servidor.</p>
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
