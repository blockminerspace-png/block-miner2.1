import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, X, Save, Megaphone, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../store/auth';

const TYPES = [
  { value: 'info',    label: 'Info',     color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'warning', label: 'Aviso',    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'success', label: 'Sucesso',  color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'promo',   label: 'Promo',    color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
];

const EMPTY_FORM = { title: '', message: '', type: 'info', link: '', linkLabel: '', isActive: true, startsAt: '', endsAt: '' };

function TypeBadge({ type }) {
  const cfg = TYPES.find(t => t.value === type) || TYPES[0];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${cfg.color}`}>{cfg.label}</span>;
}

function BannerForm({ initial, onSave, onCancel, isSaving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título *</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Título do banner"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mensagem *</label>
          <textarea
            rows={2}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
            value={form.message}
            onChange={e => set('message', e.target.value)}
            placeholder="Texto da mensagem"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
          <select
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.type}
            onChange={e => set('type', e.target.value)}
          >
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1 flex flex-col justify-end">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ativo</label>
          <button
            type="button"
            onClick={() => set('isActive', !form.isActive)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${form.isActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
          >
            {form.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {form.isActive ? 'Ativo' : 'Inativo'}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link (opcional)</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.link}
            onChange={e => set('link', e.target.value)}
            placeholder="https://... ou /pagina"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Label do botão</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.linkLabel}
            onChange={e => set('linkLabel', e.target.value)}
            placeholder="Saiba mais"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início (opcional)</label>
          <input
            type="datetime-local"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.startsAt}
            onChange={e => set('startsAt', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fim (opcional)</label>
          <input
            type="datetime-local"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.endsAt}
            onChange={e => set('endsAt', e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={isSaving || !form.title.trim() || !form.message.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition-colors disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 font-bold text-sm transition-colors"
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function AdminBanners() {
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/banners');
      if (res.data.ok) setBanners(res.data.banners);
    } catch {
      toast.error('Erro ao carregar banners.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (form) => {
    setIsSaving(true);
    try {
      const res = await api.post('/admin/banners', form);
      if (res.data.ok) {
        toast.success('Banner criado!');
        setShowCreate(false);
        await load();
      }
    } catch { toast.error('Erro ao criar.'); }
    finally { setIsSaving(false); }
  };

  const handleUpdate = async (form) => {
    setIsSaving(true);
    try {
      const res = await api.put(`/admin/banners/${editingId}`, form);
      if (res.data.ok) {
        toast.success('Banner atualizado!');
        setEditingId(null);
        await load();
      }
    } catch { toast.error('Erro ao atualizar.'); }
    finally { setIsSaving(false); }
  };

  const handleToggle = async (banner) => {
    try {
      await api.put(`/admin/banners/${banner.id}`, { ...banner, isActive: !banner.isActive });
      await load();
    } catch { toast.error('Erro ao alterar status.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este banner?')) return;
    try {
      await api.delete(`/admin/banners/${id}`);
      toast.success('Banner excluído.');
      await load();
    } catch { toast.error('Erro ao excluir.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Banners do Dashboard</h1>
            <p className="text-xs text-slate-500">{banners.length} banner(s) cadastrado(s)</p>
          </div>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => { setShowCreate(true); setEditingId(null); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Banner
          </button>
        )}
      </div>

      {showCreate && (
        <BannerForm onSave={handleCreate} onCancel={() => setShowCreate(false)} isSaving={isSaving} />
      )}

      {isLoading ? (
        <div className="text-center py-16 text-slate-500">Carregando...</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">Nenhum banner cadastrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map(banner => (
            <div key={banner.id}>
              {editingId === banner.id ? (
                <BannerForm
                  initial={{
                    ...banner,
                    startsAt: banner.startsAt ? banner.startsAt.slice(0, 16) : '',
                    endsAt: banner.endsAt ? banner.endsAt.slice(0, 16) : '',
                  }}
                  onSave={handleUpdate}
                  onCancel={() => setEditingId(null)}
                  isSaving={isSaving}
                />
              ) : (
                <div className={`flex items-start gap-4 p-4 rounded-2xl border ${banner.isActive ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800 opacity-60'}`}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type={banner.type} />
                      {!banner.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border bg-slate-800 text-slate-500 border-slate-700">Inativo</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-white">{banner.title}</p>
                    <p className="text-xs text-slate-400">{banner.message}</p>
                    {banner.link && (
                      <p className="text-xs text-slate-500 font-mono truncate">{banner.link}</p>
                    )}
                    {(banner.startsAt || banner.endsAt) && (
                      <p className="text-[10px] text-slate-600">
                        {banner.startsAt && `De: ${new Date(banner.startsAt).toLocaleString('pt-BR')}`}
                        {banner.startsAt && banner.endsAt && ' · '}
                        {banner.endsAt && `Até: ${new Date(banner.endsAt).toLocaleString('pt-BR')}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggle(banner)}
                      className={`p-2 rounded-xl border transition-colors ${banner.isActive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                      title={banner.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {banner.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(banner.id); setShowCreate(false); }}
                      className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(banner.id)}
                      className="p-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
