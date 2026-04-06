import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Eye, EyeOff, Megaphone } from 'lucide-react';
import { api } from '../store/auth';
import { toast } from 'sonner';

const EMPTY = { title: '', content: '', imageUrl: '', isActive: false };

export default function AdminBroadcast() {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            setIsLoading(true);
            const res = await api.get('/admin/broadcast');
            if (res.data.ok) setMessages(res.data.messages);
        } catch { toast.error('Erro ao carregar.'); } finally { setIsLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => { setEditId(null); setForm(EMPTY); setShowForm(true); };
    const openEdit = (m) => { setEditId(m.id); setForm({ title: m.title, content: m.content || '', imageUrl: m.imageUrl || '', isActive: m.isActive }); setShowForm(true); };
    const cancelForm = () => { setShowForm(false); setEditId(null); };

    const save = async () => {
        if (!form.title.trim()) { toast.error('Titulo obrigatorio.'); return; }
        setSaving(true);
        try {
            if (editId) {
                await api.patch(`/admin/broadcast/${editId}`, form);
                toast.success('Atualizado.');
            } else {
                await api.post('/admin/broadcast', form);
                toast.success('Criado.');
            }
            cancelForm();
            load();
        } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
    };

    const toggleActive = async (m) => {
        try {
            await api.patch(`/admin/broadcast/${m.id}`, { isActive: !m.isActive });
            toast.success(m.isActive ? 'Desativado.' : 'Ativado.');
            load();
        } catch { toast.error('Erro.'); }
    };

    const remove = async (id) => {
        if (!confirm('Deletar esta notificacao?')) return;
        try {
            await api.delete(`/admin/broadcast/${id}`);
            toast.success('Deletado.');
            load();
        } catch { toast.error('Erro.'); }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white">Notificacoes Broadcast</h2>
                    <p className="text-slate-500 text-sm mt-1">Popup exibido 1x para cada usuario apos login.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl uppercase tracking-widest transition-all"
                >
                    <Plus className="w-4 h-4" /> Nova
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 space-y-4">
                    <p className="text-xs font-black text-amber-400 uppercase tracking-widest">
                        {editId ? 'Editar Notificacao' : 'Nova Notificacao'}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Titulo *</label>
                            <input
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="Ex: Atualizacao importante!"
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Mensagem (opcional)</label>
                            <textarea
                                value={form.content}
                                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                                placeholder="Texto da notificacao..."
                                rows={3}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all resize-none"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">URL da Imagem (opcional)</label>
                            <input
                                value={form.imageUrl}
                                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                                placeholder="https://exemplo.com/imagem.png"
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
                            />
                            {form.imageUrl && (
                                <img src={form.imageUrl} alt="preview" className="mt-2 max-h-32 rounded-xl object-cover border border-slate-700" onError={e => { e.currentTarget.style.display = 'none'; }} />
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${form.isActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            >
                                {form.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                {form.isActive ? 'Ativo' : 'Inativo'}
                            </button>
                            <span className="text-[10px] text-slate-600">Ativar desativa todos os outros</span>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button onClick={save} disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl uppercase tracking-widest transition-all disabled:opacity-50">
                            <Check className="w-3 h-3" /> {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button onClick={cancelForm}
                            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-xs rounded-xl uppercase tracking-widest transition-all">
                            <X className="w-3 h-3" /> Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : messages.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 flex flex-col items-center gap-3">
                    <Megaphone className="w-8 h-8 text-slate-600" />
                    <p className="text-slate-600 text-sm font-bold">Nenhuma notificacao criada ainda.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {messages.map(m => (
                        <div key={m.id}
                            className={`bg-slate-900 border rounded-2xl p-5 flex items-start gap-4 transition-all ${m.isActive ? 'border-emerald-500/30' : 'border-slate-800'}`}>
                            {m.imageUrl && (
                                <img src={m.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-700" onError={e => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-white font-black text-sm">{m.title}</p>
                                    {m.isActive && (
                                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                                            ATIVO
                                        </span>
                                    )}
                                </div>
                                {m.content && (
                                    <p className="text-slate-500 text-xs mt-1 line-clamp-2">{m.content}</p>
                                )}
                                <p className="text-slate-600 text-[10px] mt-1.5">
                                    {m._count?.views ?? 0} visualizacoes &middot; criado em {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => toggleActive(m)}
                                    className={`p-2 rounded-xl transition-all text-xs ${m.isActive ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-slate-800 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                    title={m.isActive ? 'Desativar' : 'Ativar'}>
                                    {m.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button onClick={() => openEdit(m)}
                                    className="p-2 rounded-xl bg-slate-800 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => remove(m.id)}
                                    className="p-2 rounded-xl bg-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
