import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../../store/auth';
import {
  Youtube, Star, Gift, CheckCircle2, Clock, XCircle, Loader2,
  Upload, Send, Plus, ExternalLink, AlertTriangle,
} from 'lucide-react';

interface YoutuberProfile {
  id: number;
  channelName: string;
  channelPhoto: string | null;
  channelUrl: string | null;
  bio: string | null;
  isCredentialed: boolean;
  credentialRequestStatus: string | null;
  credentialRejectNote: string | null;
}

interface VideoSubmission {
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

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending:  { label: 'Aguardando',  cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20',   icon: Clock },
  approved: { label: 'Aprovado',    cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  rejected: { label: 'Recusado',    cls: 'text-red-400 bg-red-500/10 border-red-500/20',          icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABEL[status] ?? STATUS_LABEL.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Benefits section ─────────────────────────────────────────────────────────

function BenefitsSection() {
  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-5 h-5 text-yellow-400" />
        <h2 className="text-base font-black text-white uppercase tracking-tight">Benefícios do Parceiro</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Gift, title: '1 Miner por Vídeo', desc: 'Cada vídeo aprovado vale uma máquina mineradora grátis no seu inventário.' },
          { icon: Youtube, title: 'Visibilidade', desc: 'Seu canal aparece no feed público do BlockMiner, alcançando nossa comunidade.' },
          { icon: Star, title: 'Selo de Parceiro', desc: 'Credencial exclusiva que identifica você como criador oficial da plataforma.' },
        ].map((b) => (
          <div key={b.title} className="bg-white/5 rounded-xl p-4 border border-white/8 space-y-2">
            <b.icon className="w-5 h-5 text-yellow-400" />
            <p className="text-sm font-black text-white">{b.title}</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">{b.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">
        Envie quantos vídeos quiser para aprovação. Cada vídeo precisa mencionar o BlockMiner e incluir o link da plataforma.
      </p>
    </div>
  );
}

// ─── Credential request form ──────────────────────────────────────────────────

function CredentialForm({ onDone }: { onDone: () => void }) {
  const [channelName, setChannelName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [channelPhoto, setChannelPhoto] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    setUploading(true);
    try {
      const res = await api.post<{ ok: boolean; url: string }>('/social/upload-photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.ok) setChannelPhoto(res.data.url);
      else toast.error('Erro ao enviar foto.');
    } catch {
      toast.error('Erro ao enviar foto.');
    } finally {
      setUploading(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!channelName.trim()) return;
    setSaving(true);
    try {
      await api.post('/social/request-credential', {
        channelName: channelName.trim(),
        channelUrl: channelUrl.trim() || undefined,
        channelPhoto: channelPhoto || undefined,
        bio: bio.trim() || undefined,
      });
      toast.success('Solicitação enviada! Aguarde a aprovação do time BlockMiner.');
      onDone();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erro ao enviar solicitação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
      <h2 className="text-sm font-black text-white uppercase tracking-tight">Solicitar Parceria</h2>

      {/* Photo upload */}
      <div>
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Foto do Canal</label>
        <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoFile} />
        <div className="flex items-center gap-3">
          {channelPhoto ? (
            <img src={channelPhoto} alt="" className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
              <Youtube className="w-5 h-5" />
            </div>
          )}
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black text-gray-300 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {channelPhoto ? 'Trocar foto' : 'Carregar foto'}
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1">JPG, PNG, WebP ou GIF — máx. 3 MB</p>
      </div>

      <div>
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Nome do Canal *</label>
        <input
          value={channelName}
          onChange={(e) => setChannelName(e.target.value)}
          maxLength={100}
          placeholder="Meu Canal"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
        />
      </div>

      <div>
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Link do Canal (YouTube)</label>
        <input
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          placeholder="https://youtube.com/@..."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
        />
      </div>

      <div>
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Bio (opcional)</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Conte um pouco sobre o seu canal..."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 resize-none"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!channelName.trim() || saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Enviar Solicitação
      </button>
    </div>
  );
}

// ─── Submit video form ────────────────────────────────────────────────────────

function VideoSubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!videoUrl.trim()) return;
    setSaving(true);
    try {
      await api.post('/social/submit', { videoUrl: videoUrl.trim(), title: title.trim() || undefined });
      toast.success('Vídeo enviado para aprovação!');
      setVideoUrl('');
      setTitle('');
      onSubmitted();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erro ao enviar vídeo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 text-red-400" />
        <h2 className="text-sm font-black text-white uppercase tracking-tight">Enviar Vídeo</h2>
      </div>
      <div>
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">URL do Vídeo *</label>
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
        />
      </div>
      <div>
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Título (opcional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Título do vídeo..."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!videoUrl.trim() || saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Enviar para Aprovação
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function YoutuberPartnerPage() {
  const [profile, setProfile] = useState<YoutuberProfile | null>(null);
  const [submissions, setSubmissions] = useState<VideoSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [profileRes, subsRes] = await Promise.all([
        api.get<{ ok: boolean; profile: YoutuberProfile | null }>('/social/my-profile'),
        api.get<{ ok: boolean; submissions: VideoSubmission[] }>('/social/my-submissions'),
      ]);
      if (profileRes.data.ok) setProfile(profileRes.data.profile);
      if (subsRes.data.ok) setSubmissions(subsRes.data.submissions);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const credentialStatus = profile?.credentialRequestStatus;
  const isCredentialed = profile?.isCredentialed === true;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center">
          <Youtube className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white uppercase tracking-tight">Parceiro YouTuber</h1>
          <p className="text-[10px] text-gray-500">Divulgue o BlockMiner e ganhe máquinas</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
      ) : (
        <>
          <BenefitsSection />

          {/* Credentialed profile */}
          {isCredentialed && profile && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-4">
              {profile.channelPhoto ? (
                <img src={profile.channelPhoto} alt={profile.channelName} className="w-14 h-14 rounded-full object-cover border border-white/10 shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 shrink-0">
                  <Youtube className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-white">{profile.channelName}</p>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-black text-emerald-400">Parceiro ✓</span>
                </div>
                {profile.channelUrl && (
                  <a href={profile.channelUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 mt-0.5">
                    <ExternalLink className="w-3 h-3" /> Ver canal
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Pending request */}
          {!isCredentialed && credentialStatus === 'pending' && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-amber-300">Solicitação em análise</p>
                <p className="text-xs text-amber-400/80 mt-0.5">Nossa equipe revisará sua solicitação em breve.</p>
              </div>
            </div>
          )}

          {/* Rejected */}
          {!isCredentialed && credentialStatus === 'rejected' && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-red-300">Solicitação recusada</p>
                {profile?.credentialRejectNote && (
                  <p className="text-xs text-red-400/80 mt-0.5">{profile.credentialRejectNote}</p>
                )}
                <p className="text-xs text-red-400/60 mt-1">Você pode enviar uma nova solicitação abaixo.</p>
              </div>
            </div>
          )}

          {/* No request yet or rejected → show form */}
          {!isCredentialed && credentialStatus !== 'pending' && (
            <CredentialForm onDone={load} />
          )}

          {/* Credentialed → video submission */}
          {isCredentialed && (
            <VideoSubmitForm onSubmitted={load} />
          )}

          {/* Submissions list */}
          {submissions.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8">
                <h2 className="text-sm font-black text-white">Meus Vídeos Enviados</h2>
              </div>
              <div className="divide-y divide-white/5">
                {submissions.map((s) => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                    <a
                      href={s.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-16 h-12 rounded-lg overflow-hidden shrink-0 bg-gray-800 flex items-center justify-center"
                    >
                      <img
                        src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`}
                        alt={s.title ?? ''}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </a>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{s.title ?? s.videoId}</p>
                      <p className="text-[10px] text-gray-500">{formatDate(s.submittedAt)}</p>
                      {s.reviewNote && <p className="text-[10px] text-gray-500 mt-0.5">{s.reviewNote}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={s.status} />
                      {s.rewardGranted && (
                        <span className="text-[10px] text-emerald-400 font-black">Miner concedida ✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
