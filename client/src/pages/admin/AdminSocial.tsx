import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Youtube, Plus, Trash2, Search, X, Save, ExternalLink, CheckCircle2, XCircle,
  Clock, Settings, RefreshCw, Loader2, AlertTriangle, Play, Star,
} from 'lucide-react';
import { api } from '../../store/auth';
import { readAxiosResponseMessage } from './admin.api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: number;
  userId: number;
  channelName: string;
  channelPhoto: string | null;
  channelUrl: string | null;
  bio: string | null;
  isCredentialed: boolean;
  credentialRequestStatus: string | null;
  credentialRejectNote: string | null;
  createdAt: string;
  user: { id: number; username: string | null; name: string | null; email: string };
  _count: { submissions: number };
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
  user: { id: number; username: string | null; name: string | null };
  profile: { channelName: string; channelPhoto: string | null };
  miner: { id: number; name: string; imageUrl: string | null; baseHashRate: number } | null;
}

interface RewardMiner {
  id: number;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
}

interface SearchUser {
  id: number;
  username: string | null;
  name: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ChannelAvatar({ photo, name, size = 'md' }: { photo: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
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

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pending:  { label: 'Aguardando', icon: Clock,        cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  approved: { label: 'Aprovado',   icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  rejected: { label: 'Recusado',   icon: XCircle,      cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

// ─── Add Profile Modal ────────────────────────────────────────────────────────

function AddProfileModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelPhoto, setChannelPhoto] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      else toast.error('Erro ao fazer upload da foto.');
    } catch {
      toast.error('Erro ao fazer upload da foto.');
    } finally {
      setUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = '';
    }
  };

  const search = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get<{ ok: boolean; users?: SearchUser[] }>(`/admin/users/search?q=${encodeURIComponent(q)}&limit=6`);
        if (res.data.ok) setResults(res.data.users ?? []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
  };

  const handleSave = async () => {
    if (!selected || !channelName.trim()) return;
    setSaving(true);
    try {
      await api.post('/admin/social/profiles', {
        userId: selected.id,
        channelName: channelName.trim(),
        channelPhoto: channelPhoto.trim() || undefined,
        channelUrl: channelUrl.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      toast.success('Perfil criado com sucesso.');
      onAdded();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao criar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <p className="font-black text-white">Adicionar Criador</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* User search */}
          {!selected ? (
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Buscar usuário</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
                  placeholder="Username ou email..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50"
                />
              </div>
              {searching && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>}
              {results.length > 0 && (
                <div className="mt-2 rounded-xl border border-white/8 overflow-hidden">
                  {results.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { setSelected(u); setChannelName(u.name ?? u.username ?? ''); setResults([]); setQuery(''); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-black text-white shrink-0">
                        {(u.username ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{u.username}</p>
                        {u.name && <p className="text-[10px] text-gray-500">{u.name}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-black text-white shrink-0">
                {(selected.username ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{selected.username}</p>
                {selected.name && <p className="text-[10px] text-gray-500">{selected.name}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Nome do Canal *</label>
            <input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Nome do Canal"
              maxLength={100}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Foto do Canal</label>
            <input
              ref={photoFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handlePhotoFile}
            />
            <div className="flex items-center gap-3">
              {channelPhoto ? (
                <img src={channelPhoto} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-500 text-xs shrink-0">?</div>
              )}
              <button
                type="button"
                onClick={() => photoFileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black text-gray-300 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {channelPhoto ? 'Trocar foto' : 'Carregar foto'}
              </button>
              {channelPhoto && (
                <button type="button" onClick={() => setChannelPhoto('')} className="text-gray-600 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">JPG, PNG, WebP ou GIF — máx. 3 MB</p>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">URL do Canal (YouTube)</label>
            <input
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://youtube.com/@..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Bio (opcional)</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Breve descrição do canal..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!selected || !channelName.trim() || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditProfileModal({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const [channelName, setChannelName] = useState(profile.channelName);
  const [channelPhoto, setChannelPhoto] = useState(profile.channelPhoto ?? '');
  const [channelUrl, setChannelUrl] = useState(profile.channelUrl ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [isCredentialed, setIsCredentialed] = useState(profile.isCredentialed);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoFileRef = useRef<HTMLInputElement | null>(null);

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
      else toast.error('Erro ao fazer upload da foto.');
    } catch {
      toast.error('Erro ao fazer upload da foto.');
    } finally {
      setUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/social/profiles/${profile.id}`, {
        channelName: channelName.trim(),
        channelPhoto: channelPhoto.trim() || null,
        channelUrl: channelUrl.trim() || null,
        bio: bio.trim() || null,
        isCredentialed,
      });
      toast.success('Perfil atualizado.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <ChannelAvatar photo={profile.channelPhoto} name={profile.channelName} />
            <p className="font-black text-white">{profile.channelName}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Nome do Canal</label>
            <input value={channelName} onChange={(e) => setChannelName(e.target.value)} maxLength={100}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Foto do Canal</label>
            <input
              ref={photoFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handlePhotoFile}
            />
            <div className="flex items-center gap-3">
              {channelPhoto ? (
                <img src={channelPhoto} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-500 text-xs shrink-0">?</div>
              )}
              <button
                type="button"
                onClick={() => photoFileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black text-gray-300 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {channelPhoto ? 'Trocar foto' : 'Carregar foto'}
              </button>
              {channelPhoto && (
                <button type="button" onClick={() => setChannelPhoto('')} className="text-gray-600 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">JPG, PNG, WebP ou GIF — máx. 3 MB</p>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">URL do Canal</label>
            <input value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={500}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 resize-none" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setIsCredentialed(!isCredentialed)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isCredentialed ? 'bg-red-600' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isCredentialed ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-bold text-white">Credenciado</span>
          </label>

          <button
            onClick={handleSave}
            disabled={!channelName.trim() || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({ submission, onClose, onRejected }: { submission: Submission; onClose: () => void; onRejected: () => void }) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    try {
      await api.post(`/admin/social/submissions/${submission.id}/reject`, { reviewNote: note.trim() || undefined });
      toast.success('Vídeo recusado.');
      onRejected();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao recusar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <p className="font-black text-white">Recusar Vídeo</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
            <img
              src={`https://img.youtube.com/vi/${submission.videoId}/default.jpg`}
              alt=""
              className="w-12 h-9 rounded-lg object-cover shrink-0 border border-white/10"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{submission.title ?? submission.videoUrl}</p>
              <p className="text-[10px] text-gray-500">{submission.profile.channelName}</p>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Nota de revisão (opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Motivo da recusa..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
            />
          </div>
          <button
            onClick={handleReject}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-black text-white transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reward Settings ──────────────────────────────────────────────────────────

function RewardSettingsPanel() {
  const [miner, setMiner] = useState<RewardMiner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<RewardMiner[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ ok: boolean; minerId: number | null; miner: RewardMiner | null }>('/admin/social/reward-settings');
        if (res.data.ok) setMiner(res.data.miner);
      } catch { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  const searchMiners = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get<{ ok: boolean; miners?: RewardMiner[] }>(`/admin/miners?q=${encodeURIComponent(q)}&limit=20`);
        if (res.data.ok) setSearchResults(res.data.miners ?? []);
      } catch { setSearchResults([]); } finally { setSearchLoading(false); }
    }, 300);
  };

  const handleSelect = async (m: RewardMiner) => {
    setSearchQ('');
    setSearchResults([]);
    setSaving(true);
    try {
      const res = await api.put<{ ok: boolean; miner: RewardMiner | null }>('/admin/social/reward-settings', { minerId: m.id });
      setMiner(res.data.miner);
      toast.success('Recompensa configurada.');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await api.put('/admin/social/reward-settings', { minerId: null });
      setMiner(null);
      toast.success('Recompensa desativada.');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-gray-400" />
        <p className="text-sm font-black text-white">Máquina de Recompensa</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>
      ) : (
        <>
          {miner ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              {miner.imageUrl ? (
                <img src={miner.imageUrl} alt={miner.name} className="w-10 h-10 object-contain rounded-lg" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center text-gray-400 text-xs">?</div>
              )}
              <div className="flex-1">
                <p className="text-sm font-black text-white">{miner.name}</p>
                <p className="text-[10px] text-emerald-400">Recompensa configurada (ID: {miner.id})</p>
              </div>
              <button onClick={handleClear} disabled={saving} className="text-gray-600 hover:text-red-400 transition-colors" title="Remover recompensa">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Nenhuma máquina configurada — aprovações não concederão recompensa.
            </div>
          )}

          {/* Miner search */}
          <div className="relative">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Buscar máquina de recompensa</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); searchMiners(e.target.value); }}
                placeholder="Nome da máquina..."
                disabled={saving}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 disabled:opacity-50"
              />
              {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-500" />}
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 rounded-xl border border-white/8 overflow-hidden z-10 bg-gray-900">
                {searchResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => void handleSelect(m)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                  >
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="w-8 h-8 object-contain rounded-lg shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs shrink-0">?</div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">{m.name}</p>
                      <p className="text-[10px] text-gray-500">ID: {m.id}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-600">Cada aprovação concede uma unidade desta máquina ao criador. Remova para desativar recompensas.</p>
        </>
      )}
    </div>
  );
}

// ─── Credential Requests Tab ─────────────────────────────────────────────────

function RejectCredentialModal({ profile, onClose, onRejected }: { profile: Profile; onClose: () => void; onRejected: () => void }) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    try {
      await api.post(`/admin/social/credential-requests/${profile.id}/reject`, { rejectNote: note.trim() || undefined });
      toast.success('Solicitação recusada.');
      onRejected();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao recusar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <p className="font-black text-white">Recusar Credenciamento</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
            <ChannelAvatar photo={profile.channelPhoto} name={profile.channelName} />
            <div>
              <p className="text-sm font-bold text-white">{profile.channelName}</p>
              <p className="text-[10px] text-gray-500">@{profile.user.username}</p>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Motivo (opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Explique o motivo da recusa..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
            />
          </div>
          <button
            onClick={handleReject}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-black text-white transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

function CredentialRequestsTab() {
  const [requests, setRequests] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; profiles: Profile[] }>('/admin/social/credential-requests');
      if (res.data.ok) setRequests(res.data.profiles);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleApprove = async (profile: Profile) => {
    try {
      await api.post(`/admin/social/credential-requests/${profile.id}/approve`);
      toast.success(`${profile.channelName} credenciado!`);
      void load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao aprovar.');
    }
  };

  return (
    <>
      {rejectTarget && (
        <RejectCredentialModal
          profile={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={load}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          {requests.length} solicitaç{requests.length !== 1 ? 'ões' : 'ão'} pendente{requests.length !== 1 ? 's' : ''}
        </p>
        <button onClick={() => void load()} className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-500 hover:text-white">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
      ) : !requests.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Star className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">Nenhuma solicitação pendente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ChannelAvatar photo={r.channelPhoto} name={r.channelName} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{r.channelName}</p>
                  <p className="text-[10px] text-gray-500">@{r.user.username} · {r.user.email}</p>
                  {r.channelUrl && (
                    <a href={r.channelUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-red-400 hover:underline inline-flex items-center gap-1 mt-0.5">
                      <ExternalLink className="w-2.5 h-2.5" /> {r.channelUrl}
                    </a>
                  )}
                  {r.bio && <p className="text-xs text-gray-400 mt-1 italic">"{r.bio}"</p>}
                </div>
                <p className="text-[9px] text-gray-700 shrink-0">{new Date(r.createdAt).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleApprove(r)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black text-white transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aprovar
                </button>
                <button
                  onClick={() => setRejectTarget(r)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600/20 hover:bg-red-600/30 rounded-xl text-xs font-black text-red-400 transition-colors border border-red-500/20"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Profiles Tab ─────────────────────────────────────────────────────────────

function ProfilesTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; profiles: Profile[] }>('/admin/social/profiles');
      if (res.data.ok) setProfiles(res.data.profiles);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remover perfil de "${name}"? As submissões serão excluídas também.`)) return;
    try {
      await api.delete(`/admin/social/profiles/${id}`);
      toast.success('Perfil removido.');
      setProfiles((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao remover.');
    }
  };

  return (
    <>
      {showAdd && <AddProfileModal onClose={() => setShowAdd(false)} onAdded={load} />}
      {editing && <EditProfileModal profile={editing} onClose={() => setEditing(null)} onSaved={load} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{profiles.length} criadores</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-black text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
      ) : !profiles.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Youtube className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">Nenhum criador cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-4 rounded-2xl border border-white/8 bg-white/3">
              <ChannelAvatar photo={p.channelPhoto} name={p.channelName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-white truncate">{p.channelName}</p>
                  {p.isCredentialed && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/20 shrink-0">
                      Credenciado
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-500">
                  @{p.user.username} · {p._count.submissions} envio(s)
                </p>
                {p.channelUrl && (
                  <a href={p.channelUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-red-400 hover:underline inline-flex items-center gap-1 mt-0.5">
                    <ExternalLink className="w-2.5 h-2.5" /> Canal
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setEditing(p)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors text-xs font-black"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => void handleDelete(p.id, p.channelName)}
                  className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Submissions Tab ──────────────────────────────────────────────────────────

function SubmissionsTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [rejectTarget, setRejectTarget] = useState<Submission | null>(null);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; submissions: Submission[] }>(`/admin/social/submissions?status=${s}`);
      if (res.data.ok) setSubmissions(res.data.submissions);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(statusFilter); }, [statusFilter, load]);

  const handleApprove = async (sub: Submission) => {
    try {
      const res = await api.post<{ ok: boolean; rewardGranted: boolean; rewardMinerName: string | null }>(
        `/admin/social/submissions/${sub.id}/approve`
      );
      if (res.data.rewardGranted) {
        toast.success(`Aprovado! Máquina "${res.data.rewardMinerName}" concedida.`);
      } else {
        toast.success('Aprovado (sem recompensa configurada).');
      }
      void load(statusFilter);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao aprovar.');
    }
  };

  const filterBtns: { label: string; value: string }[] = [
    { label: 'Pendentes', value: 'pending' },
    { label: 'Aprovados', value: 'approved' },
    { label: 'Recusados', value: 'rejected' },
    { label: 'Todos', value: 'all' },
  ];

  return (
    <>
      {rejectTarget && (
        <RejectModal submission={rejectTarget} onClose={() => setRejectTarget(null)} onRejected={() => void load(statusFilter)} />
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {filterBtns.map((b) => (
          <button
            key={b.value}
            onClick={() => setStatusFilter(b.value)}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-colors ${
              statusFilter === b.value
                ? 'bg-primary text-white'
                : 'bg-white/5 text-gray-500 hover:text-white border border-white/8'
            }`}
          >
            {b.label}
          </button>
        ))}
        <button
          onClick={() => void load(statusFilter)}
          className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-500 hover:text-white ml-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
      ) : !submissions.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Youtube className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">Nenhuma submissão encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => {
            const cfg = STATUS_CFG[s.status] ?? STATUS_CFG.pending;
            const Icon = cfg.icon;
            return (
              <div key={s.id} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <a
                    href={s.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative shrink-0 group"
                  >
                    <img
                      src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`}
                      alt=""
                      className="w-24 h-[54px] rounded-xl object-cover border border-white/10"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
                        <Play className="w-3 h-3 text-white fill-white" />
                      </div>
                    </div>
                  </a>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white leading-tight truncate">{s.title ?? s.videoUrl}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <ChannelAvatar photo={s.profile.channelPhoto} name={s.profile.channelName} size="sm" />
                      <span className="text-[10px] text-gray-500">{s.profile.channelName}</span>
                      <span className="text-[9px] text-gray-700">·</span>
                      <span className="text-[10px] text-gray-600">@{s.user.username}</span>
                    </div>
                    {s.reviewNote && (
                      <p className="text-[10px] text-gray-500 mt-1 italic">"{s.reviewNote}"</p>
                    )}
                    {s.status === 'approved' && s.rewardGranted && s.miner && (
                      <p className="text-[10px] text-emerald-400 mt-1">Máquina: {s.miner.name}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    <p className="text-[9px] text-gray-700">{new Date(s.submittedAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>

                {s.status === 'pending' && (
                  <div className="flex gap-2 px-4 pb-4 pt-0">
                    <button
                      onClick={() => void handleApprove(s)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black text-white transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aprovar
                    </button>
                    <button
                      onClick={() => setRejectTarget(s)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600/20 hover:bg-red-600/30 rounded-xl text-xs font-black text-red-400 transition-colors border border-red-500/20"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Recusar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type AdminSocialTab = 'requests' | 'profiles' | 'submissions' | 'settings';

export default function AdminSocial() {
  const [activeTab, setActiveTab] = useState<AdminSocialTab>('requests');

  const tabs: { id: AdminSocialTab; label: string }[] = [
    { id: 'requests',    label: 'Solicitações' },
    { id: 'submissions', label: 'Vídeos' },
    { id: 'profiles',   label: 'Criadores' },
    { id: 'settings',   label: 'Configurações' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
          <Youtube className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Social — YouTube</h1>
          <p className="text-xs text-gray-500">Criadores credenciados e vídeos enviados</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl w-fit border border-white/8">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === t.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'requests' && <CredentialRequestsTab />}
      {activeTab === 'submissions' && <SubmissionsTab />}
      {activeTab === 'profiles' && <ProfilesTab />}
      {activeTab === 'settings' && <RewardSettingsPanel />}
    </div>
  );
}
