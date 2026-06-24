import { useState, useEffect, type ChangeEvent, type SyntheticEvent } from "react";
import { Plus, Trash2, Edit2, Check, X, Eye, EyeOff, Megaphone, Image as ImageIcon, Loader2 } from "lucide-react";
import { api } from "../../store/auth";
import { toast } from "sonner";

type AdminBroadcastForm = {
  title: string;
  content: string;
  imageUrl: string;
  isActive: boolean;
  dismissDelaySeconds: number;
  linkUrl: string;
  linkLabel: string;
  linkNewTab: boolean;
};

const EMPTY: AdminBroadcastForm = {
  title: "",
  content: "",
  imageUrl: "",
  isActive: false,
  dismissDelaySeconds: 10,
  linkUrl: "",
  linkLabel: "",
  linkNewTab: false,
};

type AdminBroadcastMessage = {
  id: number;
  title: string;
  content?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  dismissDelaySeconds?: number;
  linkUrl?: string | null;
  linkLabel?: string | null;
  linkNewTab?: boolean;
  createdAt: string | Date;
  _count?: { views?: number };
};

type AdminBroadcastListResponse = { ok: true; messages: AdminBroadcastMessage[] } | { ok: false; message?: string };

export default function AdminBroadcast() {
  const [messages, setMessages] = useState<AdminBroadcastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AdminBroadcastForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem maior que 5 MB.");
      return;
    }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await api.post<{ ok: boolean; url?: string; message?: string }>(
        "/admin/broadcast/upload-image",
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (res.data?.ok && res.data.url) {
        setForm((f) => ({ ...f, imageUrl: res.data.url! }));
        toast.success("Imagem enviada.");
      } else {
        toast.error(res.data?.message ?? "Falha no upload.");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Falha no upload.");
    } finally {
      setUploadingImage(false);
    }
  };

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<AdminBroadcastListResponse>("/admin/broadcast");
      if (res.data.ok) setMessages(res.data.messages);
    } catch {
      toast.error("Erro ao carregar.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
    setShowForm(true);
  };
  const openEdit = (m: AdminBroadcastMessage) => {
    setEditId(m.id);
    setForm({
      title: m.title,
      content: m.content || "",
      imageUrl: m.imageUrl || "",
      isActive: m.isActive,
      dismissDelaySeconds: typeof m.dismissDelaySeconds === "number" ? m.dismissDelaySeconds : 10,
      linkUrl: m.linkUrl ?? "",
      linkLabel: m.linkLabel ?? "",
      linkNewTab: Boolean(m.linkNewTab),
    });
    setShowForm(true);
  };
  const cancelForm = () => {
    setShowForm(false);
    setEditId(null);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Titulo obrigatorio.");
      return;
    }
    setSaving(true);
    try {
      if (editId != null) {
        await api.patch(`/admin/broadcast/${editId}`, form);
        toast.success("Atualizado.");
      } else {
        await api.post("/admin/broadcast", form);
        toast.success("Criado.");
      }
      cancelForm();
      await load();
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: AdminBroadcastMessage) => {
    try {
      await api.patch(`/admin/broadcast/${m.id}`, { isActive: !m.isActive });
      toast.success(m.isActive ? "Desativado." : "Ativado.");
      await load();
    } catch {
      toast.error("Erro.");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Deletar esta notificação?")) return;
    try {
      await api.delete(`/admin/broadcast/${id}`);
      toast.success("Deletado.");
      await load();
    } catch {
      toast.error("Erro.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Notificações Broadcast</h2>
          <p className="text-slate-500 text-sm mt-1">Popup exibido 1x para cada usuário após login.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl uppercase tracking-widest transition-all"
        >
          <Plus className="w-4 h-4" /> Nova
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 space-y-4">
          <p className="text-xs font-black text-amber-400 uppercase tracking-widest">
            {editId != null ? "Editar Notificação" : "Nova Notificação"}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Titulo *
              </label>
              <input
                value={form.title}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Atualização importante!"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Mensagem (opcional)
              </label>
              <textarea
                value={form.content}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Texto da notificação..."
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all resize-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                Imagem (opcional)
              </label>
              <div className="flex items-start gap-3">
                {form.imageUrl ? (
                  <img
                    src={form.imageUrl}
                    alt="preview"
                    className="h-20 w-28 object-cover rounded-xl border border-slate-700 bg-slate-900 shrink-0"
                    onError={(e: SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-20 w-28 grid place-items-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 text-slate-600 shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <label className="flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2.5 text-xs font-black text-amber-300 uppercase tracking-widest transition-colors">
                    {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    {uploadingImage ? "Enviando..." : (form.imageUrl ? "Trocar imagem" : "Enviar imagem do PC")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => void handleImageUpload(e)}
                      disabled={uploadingImage}
                    />
                  </label>
                  <input
                    value={form.imageUrl}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="…ou cole uma URL: https://exemplo.com/imagem.png"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-600">JPG, PNG, WebP ou GIF. Máx. 5 MB.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                  form.isActive
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {form.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {form.isActive ? "Ativo" : "Inativo"}
              </button>
              <span className="text-[10px] text-slate-600">Ativar desativa todos os outros</span>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Bloqueio de dismiss (segundos)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={form.dismissDelaySeconds}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const n = Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0)));
                  setForm((f) => ({ ...f, dismissDelaySeconds: n }));
                }}
                className="w-32 bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
              />
              <p className="mt-1 text-[10px] text-slate-600">0 = sem delay. Máx 120s.</p>
            </div>

            <div className="md:col-span-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 space-y-3">
              <p className="text-[10px] font-black text-sky-300 uppercase tracking-widest">
                Call-to-action (opcional)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px] gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    URL do botão
                  </label>
                  <input
                    value={form.linkUrl}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                    placeholder="/shop ou https://parceiro.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-sky-500/50 transition-all"
                  />
                  <p className="mt-1 text-[10px] text-slate-600">
                    Use <code>/rota</code> para abas internas (ex: /shop, /faucet) ou <code>https://…</code> pra externos
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Texto do botão
                  </label>
                  <input
                    value={form.linkLabel}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, linkLabel: e.target.value }))}
                    placeholder="Ir agora"
                    maxLength={60}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-sky-500/50 transition-all"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.linkNewTab}
                  onChange={(e) => setForm((f) => ({ ...f, linkNewTab: e.target.checked }))}
                  className="accent-sky-500"
                />
                <span className="text-xs text-slate-300">Abrir em nova aba</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl uppercase tracking-widest transition-all disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-xs rounded-xl uppercase tracking-widest transition-all"
            >
              <X className="w-3 h-3" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 flex flex-col items-center gap-3">
          <Megaphone className="w-8 h-8 text-slate-600" />
          <p className="text-slate-600 text-sm font-bold">Nenhuma notificação criada ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`bg-slate-900 border rounded-2xl p-5 flex items-start gap-4 transition-all ${
                m.isActive ? "border-emerald-500/30" : "border-slate-800"
              }`}
            >
              {m.imageUrl ? (
                <img
                  src={m.imageUrl}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-700"
                  onError={(e: SyntheticEvent<HTMLImageElement>) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-black text-sm">{m.title}</p>
                  {m.isActive ? (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                      ATIVO
                    </span>
                  ) : null}
                </div>
                {m.content ? <p className="text-slate-500 text-xs mt-1 line-clamp-2">{m.content}</p> : null}
                <p className="text-slate-600 text-[10px] mt-1.5">
                  {m._count?.views ?? 0} visualizações &middot; criado em{" "}
                  {new Date(m.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void toggleActive(m)}
                  className={`p-2 rounded-xl transition-all text-xs ${
                    m.isActive
                      ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-slate-800 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                  title={m.isActive ? "Desativar" : "Ativar"}
                >
                  {m.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(m)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(m.id)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
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
