import { useState, useEffect, useRef, type ChangeEvent, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, X, Save, Megaphone, ToggleLeft, ToggleRight, Upload } from 'lucide-react';
import { api } from '../../store/auth';
import { readAxiosResponseMessage } from './admin.api';

const isVideo = (url: string | null | undefined): boolean =>
  Boolean(url && /\.(mp4|webm|ogg|mov|avi)$/i.test(url));

type BannerTypeValue = 'info' | 'warning' | 'success' | 'promo';

type BannerFormState = {
  title: string;
  message: string;
  imageUrl: string;
  type: BannerTypeValue;
  link: string;
  linkLabel: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
};

type AdminBannerRow = {
  id: number;
  title: string;
  message?: string | null;
  imageUrl?: string | null;
  type: string;
  link?: string | null;
  linkLabel?: string | null;
  isActive: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

type AdminBannersListResponse = { ok: true; banners?: AdminBannerRow[] } | { ok: false };

type AdminBannerMutationResponse = { ok: boolean };

type UploadMediaResponse = { ok: true; url: string } | { ok: false; message?: string };

const TYPES: { value: BannerTypeValue; label: string; color: string }[] = [
  { value: 'info', label: 'Info', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'warning', label: 'Aviso', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'success', label: 'Sucesso', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'promo', label: 'Promo', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
];

const EMPTY_FORM: BannerFormState = {
  title: '',
  message: '',
  imageUrl: '',
  type: 'promo',
  link: '',
  linkLabel: '',
  isActive: true,
  startsAt: '',
  endsAt: '',
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPES.find((t) => t.value === type) || TYPES[0];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${cfg.color}`}>{cfg.label}</span>;
}

function mergeBannerInitial(row: AdminBannerRow): BannerFormState {
  const starts =
    row.startsAt != null ? (typeof row.startsAt === 'string' ? row.startsAt.slice(0, 16) : new Date(row.startsAt).toISOString().slice(0, 16)) : '';
  const ends =
    row.endsAt != null ? (typeof row.endsAt === 'string' ? row.endsAt.slice(0, 16) : new Date(row.endsAt).toISOString().slice(0, 16)) : '';
  const typeVal = TYPES.some((t) => t.value === row.type) ? (row.type as BannerTypeValue) : 'promo';
  return {
    title: row.title,
    message: row.message || '',
    imageUrl: row.imageUrl || '',
    type: typeVal,
    link: row.link || '',
    linkLabel: row.linkLabel || '',
    isActive: row.isActive,
    startsAt: starts,
    endsAt: ends,
  };
}

type BannerFormProps = {
  initial?: BannerFormState;
  onSave: (form: BannerFormState) => void | Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
};

function BannerForm({ initial, onSave, onCancel, isSaving }: BannerFormProps) {
  const [form, setForm] = useState<BannerFormState>(() => initial ?? EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof BannerFormState>(k: K, v: BannerFormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('media', file);
      const res = await api.post<UploadMediaResponse>('/admin/upload-media', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.ok) {
        set('imageUrl', res.data.url);
        toast.success(file.type.startsWith('video/') ? 'Vídeo enviado!' : 'Imagem enviada!');
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao enviar arquivo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mídia do Banner</label>

          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              placeholder="Cole a URL da imagem (https://...) ou envie um arquivo →"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 hover:border-amber-500/50 text-slate-400 hover:text-amber-400 text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Enviando…' : 'Upload'}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />

          {form.imageUrl ? (
            <div className="relative w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800" style={{ aspectRatio: '16/9' }}>
              {isVideo(form.imageUrl) ? (
                <video src={form.imageUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
              ) : (
                <img
                  src={form.imageUrl}
                  alt="preview"
                  className="w-full h-full object-cover"
                  onError={(ev: SyntheticEvent<HTMLImageElement>) => {
                    ev.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => set('imageUrl', '')}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 hover:bg-red-500/80 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : null}
          <p className="text-[10px] text-slate-600">Upload: PNG, JPG, GIF, WebP, MP4, WebM · máx 100 MB &nbsp;|&nbsp; URL: qualquer imagem HTTPS</p>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título *</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Título do banner"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição (opcional)</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            placeholder="Texto adicional"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
          <select
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.type}
            onChange={(e) => set('type', e.target.value as BannerTypeValue)}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 flex flex-col justify-end">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ativo</label>
          <button
            type="button"
            onClick={() => set('isActive', !form.isActive)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
              form.isActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
          >
            {form.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {form.isActive ? 'Ativo' : 'Inativo'}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link ao clicar (opcional)</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.link}
            onChange={(e) => set('link', e.target.value)}
            placeholder="https://... ou /pagina"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fim da oferta — countdown (opcional)</label>
          <input
            type="datetime-local"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.endsAt}
            onChange={(e) => set('endsAt', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início de exibição (opcional)</label>
          <input
            type="datetime-local"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.startsAt}
            onChange={(e) => set('startsAt', e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => void onSave(form)}
          disabled={isSaving || uploading || !form.title.trim()}
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
  const [banners, setBanners] = useState<AdminBannerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<AdminBannersListResponse>('/admin/banners');
      if (res.data.ok) setBanners(res.data.banners || []);
    } catch {
      toast.error('Erro ao carregar banners.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (form: BannerFormState) => {
    setIsSaving(true);
    try {
      const res = await api.post<AdminBannerMutationResponse>('/admin/banners', form);
      if (res.data.ok) {
        toast.success('Banner criado!');
        setShowCreate(false);
        await load();
      }
    } catch {
      toast.error('Erro ao criar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (form: BannerFormState) => {
    if (editingId == null) return;
    setIsSaving(true);
    try {
      const res = await api.put<AdminBannerMutationResponse>(`/admin/banners/${editingId}`, form);
      if (res.data.ok) {
        toast.success('Banner atualizado!');
        setEditingId(null);
        await load();
      }
    } catch {
      toast.error('Erro ao atualizar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (banner: AdminBannerRow) => {
    try {
      await api.put<AdminBannerMutationResponse>(`/admin/banners/${banner.id}`, { ...banner, isActive: !banner.isActive });
      await load();
    } catch {
      toast.error('Erro ao alterar status.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este banner?')) return;
    try {
      await api.delete(`/admin/banners/${id}`);
      toast.success('Banner excluído.');
      await load();
    } catch {
      toast.error('Erro ao excluir.');
    }
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
        {!showCreate ? (
          <button
            type="button"
            onClick={() => {
              setShowCreate(true);
              setEditingId(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Banner
          </button>
        ) : null}
      </div>

      {showCreate ? <BannerForm initial={EMPTY_FORM} onSave={handleCreate} onCancel={() => setShowCreate(false)} isSaving={isSaving} /> : null}

      {isLoading ? (
        <div className="text-center py-16 text-slate-500">Carregando...</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">Nenhum banner cadastrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((banner) => (
            <div key={banner.id}>
              {editingId === banner.id ? (
                <BannerForm
                  key={banner.id}
                  initial={mergeBannerInitial(banner)}
                  onSave={handleUpdate}
                  onCancel={() => setEditingId(null)}
                  isSaving={isSaving}
                />
              ) : (
                <div
                  className={`flex items-start gap-4 p-4 rounded-2xl border ${
                    banner.isActive ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800 opacity-60'
                  }`}
                >
                  {banner.imageUrl ? (
                    <div className="w-24 h-14 rounded-xl overflow-hidden shrink-0 bg-slate-800 border border-slate-700">
                      <img src={banner.imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type={banner.type} />
                      {!banner.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border bg-slate-800 text-slate-500 border-slate-700">
                          Inativo
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm font-bold text-white">{banner.title}</p>
                    <p className="text-xs text-slate-400">{banner.message}</p>
                    {banner.link ? <p className="text-xs text-slate-500 font-mono truncate">{banner.link}</p> : null}
                    {banner.startsAt || banner.endsAt ? (
                      <p className="text-[10px] text-slate-600">
                        {banner.startsAt ? `De: ${new Date(banner.startsAt).toLocaleString('pt-BR')}` : ''}
                        {banner.startsAt && banner.endsAt ? ' · ' : ''}
                        {banner.endsAt ? `Até: ${new Date(banner.endsAt).toLocaleString('pt-BR')}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleToggle(banner)}
                      className={`p-2 rounded-xl border transition-colors ${
                        banner.isActive
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                      }`}
                      title={banner.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {banner.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(banner.id);
                        setShowCreate(false);
                      }}
                      className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(banner.id)}
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
