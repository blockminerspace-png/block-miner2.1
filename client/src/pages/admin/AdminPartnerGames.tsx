import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { Plus, Trash2, Edit2, Check, X, Eye, EyeOff, Gamepad2, ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { api } from "../../store/auth";
import { toast } from "sonner";

type PartnerGameForm = {
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string;
  iframeUrl: string;
  fallbackUrl: string;
  partnerUrl: string;
  launchMode: "iframe" | "external";
  isVisible: boolean;
  sortOrder: number;
};

const EMPTY: PartnerGameForm = {
  title: "",
  slug: "",
  description: "",
  coverImageUrl: "",
  iframeUrl: "",
  fallbackUrl: "",
  partnerUrl: "",
  launchMode: "iframe",
  isVisible: true,
  sortOrder: 0,
};

type AdminPartnerGame = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  iframeUrl: string;
  fallbackUrl: string | null;
  partnerUrl: string | null;
  launchMode?: "iframe" | "external";
  isVisible: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

type ListResponse = { ok: true; games: AdminPartnerGame[] } | { ok: false; message?: string };
type SingleResponse = { ok: true; game: AdminPartnerGame } | { ok: false; message?: string };

export default function AdminPartnerGames() {
  const [games, setGames] = useState<AdminPartnerGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PartnerGameForm>(EMPTY);
  const [uploadingCover, setUploadingCover] = useState(false);

  const handleCoverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be picked again
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem maior que 5 MB.');
      return;
    }
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append('cover', file);
      const res = await api.post<{ ok: boolean; url?: string; message?: string }>(
        '/admin/partner-games/upload-cover',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      if (res.data?.ok && res.data.url) {
        setForm((f) => ({ ...f, coverImageUrl: res.data.url! }));
        toast.success('Capa enviada.');
      } else {
        toast.error(res.data?.message ?? 'Falha no upload.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha no upload.');
    } finally {
      setUploadingCover(false);
    }
  };
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<ListResponse>("/admin/partner-games");
      if (res.data.ok) setGames(res.data.games);
    } catch {
      toast.error("Erro ao carregar jogos parceiros.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY, sortOrder: games.length * 10 });
    setShowForm(true);
  };

  const startEdit = (g: AdminPartnerGame) => {
    setEditId(g.id);
    setForm({
      title: g.title,
      slug: g.slug,
      description: g.description ?? "",
      coverImageUrl: g.coverImageUrl ?? "",
      iframeUrl: g.iframeUrl,
      fallbackUrl: g.fallbackUrl ?? "",
      partnerUrl: g.partnerUrl ?? "",
      launchMode: g.launchMode === "external" ? "external" : "iframe",
      isVisible: g.isVisible,
      sortOrder: g.sortOrder,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setEditId(null);
    setForm(EMPTY);
    setShowForm(false);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((f) => ({ ...f, [name]: checked }));
    } else if (type === "number") {
      setForm((f) => ({ ...f, [name]: Number(value) }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.iframeUrl.trim()) {
      toast.error("Título e URL do iframe são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        description: form.description.trim() || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        iframeUrl: form.iframeUrl.trim(),
        fallbackUrl: form.fallbackUrl.trim() || null,
        partnerUrl: form.partnerUrl.trim() || null,
        launchMode: form.launchMode,
        isVisible: form.isVisible,
        sortOrder: Math.trunc(form.sortOrder),
      };
      const res = editId
        ? await api.put<SingleResponse>(`/admin/partner-games/${editId}`, body)
        : await api.post<SingleResponse>(`/admin/partner-games`, body);
      if (res.data.ok) {
        toast.success(editId ? "Jogo parceiro atualizado." : "Jogo parceiro criado.");
        cancelForm();
        void load();
      } else {
        toast.error(res.data.message || "Erro ao salvar.");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = async (g: AdminPartnerGame) => {
    try {
      const res = await api.put<SingleResponse>(`/admin/partner-games/${g.id}`, { isVisible: !g.isVisible });
      if (res.data.ok) {
        const updated = res.data.game;
        setGames((prev) => prev.map((row) => (row.id === g.id ? updated : row)));
        toast.success(!g.isVisible ? "Visível para usuários." : "Oculto dos usuários.");
      }
    } catch {
      toast.error("Erro ao alterar visibilidade.");
    }
  };

  const remove = async (g: AdminPartnerGame) => {
    if (!window.confirm(`Excluir "${g.title}"?`)) return;
    try {
      await api.delete(`/admin/partner-games/${g.id}`);
      toast.success("Removido.");
      setGames((prev) => prev.filter((row) => row.id !== g.id));
    } catch {
      toast.error("Erro ao remover.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
            <Gamepad2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Jogos Parceiros</h1>
            <p className="text-xs text-gray-500">
              Catálogo de jogos externos exibidos na aba /games. URLs do iframe são adicionadas
              automaticamente à allowlist CSP.
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={startCreate}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-5"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-white">
              {editId ? `Editando #${editId}` : "Novo jogo parceiro"}
            </p>
            <button
              type="button"
              onClick={cancelForm}
              className="text-[10px] text-gray-500 hover:text-gray-300 font-bold"
            >
              Cancelar
            </button>
          </div>

          <Field label="Título *" name="title" value={form.title} onChange={handleChange} required maxLength={200} />
          <Field
            label="Slug (URL)"
            name="slug"
            value={form.slug}
            onChange={handleChange}
            maxLength={80}
            placeholder="genesisdao — /games/partner/genesisdao"
          />
          <Field
            label="Descrição"
            name="description"
            value={form.description}
            onChange={handleChange}
            textarea
            maxLength={1000}
            placeholder="Texto curto exibido no card"
          />
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Capa
            </label>
            <div className="flex items-center gap-3">
              {form.coverImageUrl ? (
                <img
                  src={form.coverImageUrl}
                  alt=""
                  className="h-16 w-28 object-cover rounded-lg border border-white/10 bg-slate-800"
                />
              ) : (
                <div className="h-16 w-28 grid place-items-center rounded-lg border border-dashed border-white/10 bg-slate-800/40 text-slate-600">
                  <ImageIcon className="h-4 w-4" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <label className="flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-4 py-2 text-xs font-bold text-sky-300 transition-colors">
                  {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {uploadingCover ? 'Enviando…' : (form.coverImageUrl ? 'Trocar imagem' : 'Enviar imagem do PC')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleCoverUpload(e)}
                    disabled={uploadingCover}
                  />
                </label>
                <input
                  type="url"
                  value={form.coverImageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                  placeholder="…ou cole uma URL: https://…/cover.jpg"
                  className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none"
                />
              </div>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">JPG, PNG, WebP ou GIF. Máx. 5 MB.</p>
          </div>
          <Field
            label="URL do iframe *"
            name="iframeUrl"
            value={form.iframeUrl}
            onChange={handleChange}
            type="url"
            required
            placeholder="https://parceiro.com/game"
          />
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Modo de abertura
            </label>
            <select
              name="launchMode"
              value={form.launchMode}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  launchMode: e.target.value === "external" ? "external" : "iframe",
                }))
              }
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none"
            >
              <option value="iframe">Iframe (jogar dentro do BlockMiner)</option>
              <option value="external">Nova aba (login/registro ou parceiro bloqueia embed)</option>
            </select>
          </div>
          <Field
            label="URL de fallback (caso o iframe seja bloqueado)"
            name="fallbackUrl"
            value={form.fallbackUrl}
            onChange={handleChange}
            type="url"
            placeholder="Mesmo URL ou versão alternativa"
          />
          <Field
            label="URL do parceiro (botão Visitar Canal)"
            name="partnerUrl"
            value={form.partnerUrl}
            onChange={handleChange}
            type="url"
            placeholder="https://parceiro.com/?ref=blockminer"
          />
          <Field
            label="Ordem (menor = aparece primeiro)"
            name="sortOrder"
            value={form.sortOrder}
            onChange={handleChange}
            type="number"
          />
          <label className="flex items-center gap-2 text-sm font-bold text-white">
            <input
              type="checkbox"
              name="isVisible"
              checked={form.isVisible}
              onChange={handleChange}
              className="h-4 w-4"
            />
            Visível na lista pública
          </label>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {editId ? "Salvar" : "Criar"}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      ) : !games.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 py-16 text-slate-500">
          <Gamepad2 className="h-10 w-10 opacity-30" />
          <p className="text-sm font-bold">Nenhum jogo parceiro cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3"
            >
              <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800">
                {g.coverImageUrl ? (
                  <img
                    src={g.coverImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-slate-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black text-white">{g.title}</p>
                  {!g.isVisible && (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[9px] font-black text-slate-300">
                      Oculto
                    </span>
                  )}
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-black text-slate-400">
                    #{g.sortOrder}
                  </span>
                </div>
                <a
                  href={g.iframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500 hover:text-gray-300"
                  title={g.iframeUrl}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {g.iframeUrl}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleVisible(g)}
                  title={g.isVisible ? "Ocultar" : "Tornar visível"}
                  className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-400 transition-colors hover:text-white"
                >
                  {g.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(g)}
                  title="Editar"
                  className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-400 transition-colors hover:text-white"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(g)}
                  title="Excluir"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-400 transition-colors hover:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  name: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  textarea?: boolean;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
};

function Field({ label, name, value, onChange, textarea, type = "text", required, placeholder, maxLength }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</label>
      {textarea ? (
        <textarea
          name={name}
          value={String(value)}
          onChange={onChange}
          rows={2}
          maxLength={maxLength}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none"
        />
      ) : (
        <input
          name={name}
          type={type}
          value={value as string | number}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none"
        />
      )}
    </div>
  );
}
