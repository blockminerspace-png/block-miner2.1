import { useState, useEffect, useCallback, useRef } from 'react';
import { Youtube, Send, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Play, Loader2, AlertTriangle, Star, Gift, Cpu, Users, ThumbsUp, ThumbsDown, ExternalLink, Pencil } from 'lucide-react';
import { api, useAuthStore } from '../../store/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YoutuberProfile {
  id: number;
  channelName: string;
  channelPhoto: string | null;
  channelUrl: string | null;
  bio?: string | null;
  isCredentialed: boolean;
  credentialRequestStatus: string | null;
  credentialRejectNote: string | null;
}

interface FeedEntry {
  id: number;
  videoId: string;
  videoUrl: string;
  title: string | null;
  reviewedAt: string;
  likeCount: number;
  dislikeCount: number;
  myVote: 1 | -1 | 0;
  profile: {
    channelName: string;
    channelPhoto: string | null;
    channelUrl: string | null;
  };
}

interface FeedResponse {
  ok: boolean;
  entries: FeedEntry[];
  total: number;
  page: number;
  totalPages: number;
}

interface Submission {
  id: number;
  videoId: string;
  videoUrl: string;
  title: string | null;
  status: string;
  reviewNote: string | null;
  rewardGranted: boolean;
  submittedAt: string;
  reviewedAt: string | null;
}

// ─── Channel avatar ───────────────────────────────────────────────────────────

function ChannelAvatar({ photo, name, size = 'md' }: { photo: string | null; name: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-10 h-10 text-xs';
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className={`${dim} rounded-full object-cover shrink-0 border border-white/10`}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-red-600 flex items-center justify-center font-black text-white shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({ entry, onVoted }: { entry: FeedEntry; onVoted: (next: Pick<FeedEntry, 'id' | 'likeCount' | 'dislikeCount' | 'myVote'>) => void }) {
  const { user } = useAuthStore();
  const [voting, setVoting] = useState(false);
  const thumb = `https://img.youtube.com/vi/${entry.videoId}/hqdefault.jpg`;

  const vote = async (value: 1 | -1) => {
    if (!user || voting) return;
    // If user re-clicks their existing vote, server treats it as toggle-off → we send the same value.
    setVoting(true);
    try {
      const res = await api.post<{ ok: boolean; submissionId: number; likeCount: number; dislikeCount: number; myVote: 1 | -1 | 0 }>(
        `/social/videos/${entry.id}/vote`,
        { value },
      );
      if (res.data.ok) {
        onVoted({ id: entry.id, likeCount: res.data.likeCount, dislikeCount: res.data.dislikeCount, myVote: res.data.myVote });
      }
    } catch { /* silent */ } finally {
      setVoting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden flex flex-col group">
      <a
        href={entry.videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block overflow-hidden"
        style={{ aspectRatio: '16/9' }}
      >
        <img
          src={thumb}
          alt={entry.title ?? 'Vídeo'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-xl">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>
        <div className="absolute top-2 right-2">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black">
            <Youtube className="w-3 h-3" /> YouTube
          </div>
        </div>
      </a>

      <div className="p-3 flex gap-2.5">
        <ChannelAvatar photo={entry.profile.channelPhoto} name={entry.profile.channelName} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white leading-snug line-clamp-2">
            {entry.title ?? `Vídeo de ${entry.profile.channelName}`}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">{entry.profile.channelName}</p>
        </div>
      </div>

      {/* Actions row: like / dislike / visit channel */}
      <div className="px-3 pb-3 flex items-center gap-2 mt-auto">
        <button
          type="button"
          onClick={() => vote(1)}
          disabled={!user || voting}
          aria-label="Curtir"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            entry.myVote === 1
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>{entry.likeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => vote(-1)}
          disabled={!user || voting}
          aria-label="Não curtir"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            entry.myVote === -1
              ? 'bg-red-500/20 border-red-500/40 text-red-300'
              : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
          }`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          <span>{entry.dislikeCount}</span>
        </button>
        {entry.profile.channelUrl && (
          <a
            href={entry.profile.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Visitar Canal</span>
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Partner benefits ─────────────────────────────────────────────────────────

function PartnerBenefits() {
  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-950/10 p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Star className="w-4 h-4 text-violet-400" />
        <p className="text-sm font-black text-white">Benefícios do Parceiro Criador</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/8 px-4 py-3">
          <Cpu className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-white">1 Máquina por Vídeo</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Ganhe uma máquina mineradora a cada vídeo aprovado pela equipe.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/8 px-4 py-3">
          <Users className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-white">Parceria Oficial</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Seu canal aparece no feed social da plataforma para todos os usuários.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/8 px-4 py-3">
          <Gift className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-white">Envios Ilimitados</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Envie quantos vídeos quiser para revisão — sem limite por vez.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Credential request form ──────────────────────────────────────────────────

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function CredentialRequestForm({ profile, onRequested }: { profile: YoutuberProfile | null; onRequested: (p: YoutuberProfile) => void }) {
  const [channelName, setChannelName] = useState(profile?.channelName ?? '');
  const [channelUrl, setChannelUrl] = useState(profile?.channelUrl ?? '');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.channelPhoto ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile?.channelPhoto ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const isResubmit = profile?.credentialRequestStatus === 'rejected';

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setError('Formato inválido. Use JPG, PNG, WebP ou GIF.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Foto muito grande. Máximo 3 MB.');
      return;
    }
    setError(null);
    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await api.post<{ ok: boolean; url: string }>('/social/upload-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPhotoUrl(res.data.url);
    } catch {
      setError('Erro ao enviar foto. Tente novamente.');
      setPhotoPreview(profile?.channelPhoto ?? null);
      setPhotoUrl(profile?.channelPhoto ?? null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ ok: boolean; profile: YoutuberProfile }>('/social/request-credential', {
        channelName: channelName.trim(),
        channelUrl: channelUrl.trim() || undefined,
        channelPhoto: photoUrl ?? undefined,
        bio: bio.trim() || undefined,
      });
      onRequested(res.data.profile);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Erro ao enviar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-red-400" />
        <p className="text-sm font-black text-white">
          {isResubmit ? 'Reenviar Solicitação de Credenciamento' : 'Solicitar Credenciamento de Criador'}
        </p>
      </div>

      <p className="text-xs text-gray-500">
        Preencha os dados do seu canal. Nossa equipe vai revisar e liberar o acesso para envio de vídeos.
      </p>

      {isResubmit && profile.credentialRejectNote && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-xs mb-0.5">Recusado anteriormente:</p>
            <p className="text-xs">{profile.credentialRejectNote}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            Nome do Canal *
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="Nome do seu canal no YouTube"
            required
            maxLength={100}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            URL do Canal
          </label>
          <input
            type="url"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="https://youtube.com/@seucanal"
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            Foto do Canal
          </label>
          <div className="flex items-center gap-3">
            {photoPreview ? (
              <img src={photoPreview} alt="preview" className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Youtube className="w-5 h-5 text-gray-600" />
              </div>
            )}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {uploadingPhoto ? 'Enviando...' : 'Escolher foto'}
              </button>
              <p className="text-[10px] text-gray-600 mt-1">JPG, PNG, WebP ou GIF · Máx. 3 MB</p>
            </div>
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            Sobre o Canal (opcional)
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Conte um pouco sobre seu canal..."
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || uploadingPhoto || !channelName.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isResubmit ? 'Reenviar Solicitação' : 'Enviar Solicitação'}
        </button>
      </form>
    </div>
  );
}

// ─── Edit profile form (credentialed creators) ───────────────────────────────

function EditProfileForm({ profile, onSaved }: { profile: YoutuberProfile; onSaved: (p: YoutuberProfile) => void }) {
  const [open, setOpen] = useState(false);
  const [channelName, setChannelName] = useState(profile.channelName);
  const [channelUrl, setChannelUrl] = useState(profile.channelUrl ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile.channelPhoto ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile.channelPhoto ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  // Resync local state when parent profile changes after a save.
  useEffect(() => {
    setChannelName(profile.channelName);
    setChannelUrl(profile.channelUrl ?? '');
    setBio(profile.bio ?? '');
    setPhotoPreview(profile.channelPhoto ?? null);
    setPhotoUrl(profile.channelPhoto ?? null);
  }, [profile.id, profile.channelName, profile.channelUrl, profile.bio, profile.channelPhoto]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setError('Formato inválido. Use JPG, PNG, WebP ou GIF.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Foto muito grande. Máximo 3 MB.');
      return;
    }
    setError(null);
    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await api.post<{ ok: boolean; url: string }>('/social/upload-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPhotoUrl(res.data.url);
    } catch {
      setError('Erro ao enviar foto. Tente novamente.');
      setPhotoPreview(profile.channelPhoto ?? null);
      setPhotoUrl(profile.channelPhoto ?? null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const res = await api.put<{ ok: boolean; profile: YoutuberProfile }>('/social/my-profile', {
        channelName: channelName.trim(),
        channelUrl: channelUrl.trim(),
        channelPhoto: photoUrl,
        bio: bio.trim(),
      });
      onSaved(res.data.profile);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Erro ao salvar perfil.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white hover:border-white/20 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        Editar perfil
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-950/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-violet-400" />
          <p className="text-sm font-black text-white">Editar perfil do canal</p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setSuccess(false); setError(null); }}
          className="text-[10px] text-gray-500 hover:text-gray-300 font-bold"
        >
          Fechar
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Atualize o nome, a foto, o link e a bio do seu canal. As mudanças aparecem imediatamente no Canal Social.
      </p>

      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Perfil atualizado!
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            Nome do Canal *
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            required
            maxLength={100}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            URL do Canal
          </label>
          <input
            type="url"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="https://youtube.com/@seucanal"
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            Foto do Canal
          </label>
          <div className="flex items-center gap-3">
            {photoPreview ? (
              <img src={photoPreview} alt="preview" className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Youtube className="w-5 h-5 text-gray-600" />
              </div>
            )}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {uploadingPhoto ? 'Enviando...' : 'Trocar foto'}
              </button>
              <p className="text-[10px] text-gray-600 mt-1">JPG, PNG, WebP ou GIF · Máx. 3 MB</p>
            </div>
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            Sobre o Canal
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || uploadingPhoto || !channelName.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Salvar alterações
        </button>
      </form>
    </div>
  );
}

// ─── Submit form ──────────────────────────────────────────────────────────────

function SubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/social/submit', { videoUrl: url.trim(), title: title.trim() || undefined });
      setSuccess(true);
      setUrl('');
      setTitle('');
      onSubmitted();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Erro ao enviar vídeo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Youtube className="w-4 h-4 text-red-400" />
        <p className="text-sm font-black text-white">Enviar Vídeo para Aprovação</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Vídeo enviado! Aguardando aprovação do admin.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            URL do YouTube *
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setSuccess(false); }}
            placeholder="https://youtube.com/watch?v=..."
            required
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            Título do vídeo (opcional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do vídeo..."
            maxLength={200}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar para Revisão
        </button>
      </form>
    </div>
  );
}

// ─── Submission history ───────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pending:  { label: 'Aguardando', icon: Clock,         cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  approved: { label: 'Aprovado',   icon: CheckCircle2,  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  rejected: { label: 'Recusado',   icon: XCircle,       cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

function MySubmissions() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ ok: boolean; submissions: Submission[] }>('/social/my-submissions');
        if (res.data.ok) setSubs(res.data.submissions);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>;
  if (!subs.length) return null;

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 bg-white/3">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Meus Envios</p>
      </div>
      <div className="divide-y divide-white/5">
        {subs.map((s) => {
          const cfg = STATUS_CFG[s.status] ?? STATUS_CFG.pending;
          const Icon = cfg.icon;
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <img
                src={`https://img.youtube.com/vi/${s.videoId}/default.jpg`}
                alt=""
                className="w-12 h-9 rounded-lg object-cover shrink-0 border border-white/10"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{s.title ?? s.videoUrl}</p>
                {s.reviewNote && <p className="text-[10px] text-gray-500 mt-0.5">{s.reviewNote}</p>}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </span>
                {s.status === 'approved' && s.rewardGranted && (
                  <span className="text-[10px] text-emerald-400">Máquina concedida!</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Social Tab ──────────────────────────────────────────────────────────

export default function SocialTab() {
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loadingFeed, setLoadingFeed] = useState(true);

  const loadFeed = useCallback(async (p: number) => {
    setLoadingFeed(true);
    try {
      const res = await api.get<FeedResponse>(`/social/feed?page=${p}`);
      if (res.data.ok) setFeed(res.data);
    } catch { /* silent */ } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => { void loadFeed(page); }, [page, loadFeed]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
          <Youtube className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-black text-white">Canal Social</p>
          <p className="text-[10px] text-gray-500">Vídeos dos criadores credenciados BlockMiner</p>
        </div>
        {feed && (
          <span className="ml-auto text-[10px] text-gray-600 font-bold">
            {feed.total} vídeo{feed.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Feed */}
      {loadingFeed ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : !feed?.entries?.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Youtube className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">Nenhum vídeo publicado ainda.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {feed.entries.map((e) => (
              <VideoCard
                key={e.id}
                entry={e}
                onVoted={(next) => {
                  // Update only the voted entry inside the current page snapshot.
                  setFeed((prev) =>
                    prev
                      ? {
                          ...prev,
                          entries: prev.entries.map((row) =>
                            row.id === next.id
                              ? { ...row, likeCount: next.likeCount, dislikeCount: next.dislikeCount, myVote: next.myVote }
                              : row,
                          ),
                        }
                      : prev,
                  );
                }}
              />
            ))}
          </div>

          {feed.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-500 font-bold">{page} / {feed.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(feed.totalPages, p + 1))}
                disabled={page >= feed.totalPages}
                className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Credential / Creator Tab ─────────────────────────────────────────────────

export function CredentialTab() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<YoutuberProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const res = await api.get<{ ok: boolean; profile: YoutuberProfile | null }>('/social/my-profile');
        setProfile(res.data.ok ? res.data.profile : null);
      } catch { setProfile(null); }
    })();
  }, [user]);

  const isCredentialed = profile?.isCredentialed === true;
  const isPending = !isCredentialed && profile?.credentialRequestStatus === 'pending';
  const isRejected = !isCredentialed && profile?.credentialRequestStatus === 'rejected';
  const hasNoRequest = !isCredentialed && !isPending && !isRejected;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
        <Star className="w-10 h-10 opacity-30" />
        <p className="text-sm font-bold">Faça login para solicitar credenciamento.</p>
      </div>
    );
  }

  if (profile === undefined) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
          <Star className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-black text-white">Área do Criador</p>
          <p className="text-[10px] text-gray-500">Solicite credenciamento e envie vídeos</p>
        </div>
      </div>

      <PartnerBenefits />

      {/* ── Credenciado ── */}
      {isCredentialed && profile && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-950/10 px-4 py-3">
            <ChannelAvatar photo={profile.channelPhoto} name={profile.channelName} />
            <div className="flex-1">
              <p className="text-sm font-black text-white">{profile.channelName}</p>
              <p className="text-[10px] text-red-400">Criador Credenciado</p>
            </div>
          </div>
          <EditProfileForm profile={profile} onSaved={(p) => setProfile(p)} />
          <SubmitForm onSubmitted={() => {}} />
          <MySubmissions />
        </div>
      )}

      {/* ── Aguardando aprovação ── */}
      {isPending && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-4">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Solicitação em análise</p>
            <p className="text-xs text-amber-400/70">Aguarde a revisão da equipe BlockMiner.</p>
          </div>
        </div>
      )}

      {/* ── Recusado — permite reenvio ── */}
      {isRejected && (
        <CredentialRequestForm profile={profile} onRequested={(p) => setProfile(p)} />
      )}

      {/* ── Sem solicitação ── */}
      {hasNoRequest && (
        <CredentialRequestForm profile={null} onRequested={(p) => setProfile(p)} />
      )}
    </div>
  );
}
