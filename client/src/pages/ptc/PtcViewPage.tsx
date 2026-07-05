import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Eye, Timer, CheckCircle2, Gift, Loader2, ExternalLink,
  Info, Megaphone, AlertCircle, PauseCircle, XCircle, RefreshCw,
  Globe, PlayCircle,
} from 'lucide-react';
import { api } from '../../store/auth';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import { usePtcSessionStore } from '../../store/ptcSession';
import { useActiveViewSeconds } from '../internal-offerwall/internalOfferwallHooks';
import { useDocumentTitleCountdown } from '../../shared/hooks/useDocumentTitleCountdown';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PtcAd {
  id: number;
  title: string;
  description?: string;
  url: string;
  adType: 'iframe' | 'window';
  durationSeconds: number;
  rewardPerViewShib: string;
  views?: number;
  targetViews?: number;
}

interface PtcSettings {
  rewardPerViewShib: string;
  isEnabled: boolean;
}

interface SessionApiResponse {
  id: string;
  status: string;
  accumulatedMs: number;
  ad: PtcAd;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function domainToGradient(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1},40%,14%), hsl(${h2},50%,10%))`;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-surface border border-gray-800/50 rounded-3xl overflow-hidden animate-pulse">
      <div className="aspect-video bg-gray-800/70" />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 bg-gray-800 rounded w-3/5" />
          <div className="h-5 bg-gray-800 rounded-full w-16" />
        </div>
        <div className="h-3 bg-gray-800 rounded w-full" />
        <div className="h-3 bg-gray-800 rounded w-4/5" />
        <div className="flex gap-2 pt-1">
          <div className="h-6 bg-gray-800 rounded-lg w-14" />
          <div className="h-6 bg-gray-800 rounded-lg w-24" />
          <div className="h-6 bg-gray-800 rounded-lg w-20 ml-auto" />
        </div>
        <div className="h-11 bg-gray-800 rounded-2xl mt-1" />
      </div>
    </div>
  );
}

// ── Site preview (favicon + gradient, iframe fallback) ────────────────────────

const SitePreview = memo(function SitePreview({ url, title, isActive }: { url: string; title: string; isActive?: boolean }) {
  const [faviconError, setFaviconError] = useState(false);
  const domain = useMemo(() => extractDomain(url), [url]);
  const gradient = useMemo(() => domainToGradient(domain), [domain]);
  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?sz=64&domain=${domain}`
    : '';

  return (
    <div
      className="relative aspect-video shrink-0 rounded-t-3xl overflow-hidden"
      style={{ background: gradient }}
    >
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/40" />

      {/* Favicon + domain */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
        {!faviconError && faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            loading="lazy"
            className="w-14 h-14 rounded-2xl shadow-2xl ring-2 ring-white/10 bg-white/5"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-white/5 ring-2 ring-white/10 flex items-center justify-center">
            <Globe className="w-7 h-7 text-white/30" />
          </div>
        )}
        <span className="text-white/40 text-[11px] font-medium tracking-wide">{domain}</span>
      </div>

      {/* Active session pulse badge */}
      {isActive && (
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 border border-sky-500/40">
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse block" />
            <span className="text-sky-300 text-[9px] font-black uppercase tracking-widest">Ativo</span>
          </div>
        </div>
      )}

      {/* External link hint on hover */}
      <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
          <ExternalLink className="w-2.5 h-2.5 text-white/50" />
          <span className="text-white/40 text-[9px] font-medium">abre em nova aba</span>
        </div>
      </div>
    </div>
  );
});

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ ads }: { ads: PtcAd[] }) {
  const totalReward = ads.reduce((s, a) => s + Number(a.rewardPerViewShib), 0);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Disponíveis hoje */}
      <div className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-sky-500/10 border border-sky-500/20">
        <div className="p-3 rounded-2xl bg-sky-500/15 shrink-0">
          <Eye className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <p className="text-sky-300 font-black text-3xl leading-none tabular-nums">{ads.length}</p>
          <p className="text-sky-600 text-[10px] font-bold uppercase tracking-widest mt-1 leading-none">
            Disponíveis (24h)
          </p>
        </div>
      </div>

      {/* Total a ganhar */}
      <div className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-orange-500/10 border border-orange-500/20">
        <div className="p-3 rounded-2xl bg-orange-500/15 shrink-0">
          <img
            src="/shib.png"
            alt=""
            className="w-5 h-5 rounded-full"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="min-w-0">
          <p className="text-orange-300 font-black text-3xl leading-none tabular-nums truncate">
            +{totalReward.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-orange-600 text-[10px] font-bold uppercase tracking-widest mt-1 leading-none">
            SHIB disponíveis para ganhar
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Ad card ───────────────────────────────────────────────────────────────────

interface AdCardProps {
  ad: PtcAd;
  storeSession: ReturnType<typeof usePtcSessionStore.getState>['session'];
  storeStatus: ReturnType<typeof usePtcSessionStore.getState>['status'];
  isStarting: boolean;
  onStart: (ad: PtcAd) => void;
  onGoToSession: () => void;
}

const AdCard = memo(function AdCard({
  ad, storeSession, storeStatus, isStarting, onStart, onGoToSession,
}: AdCardProps) {
  const isThisAdActive = storeSession?.adId === ad.id;
  const hasOtherSession = Boolean(storeSession) && !isThisAdActive;
  const remainingViews = Math.max(0, (ad.targetViews ?? 0) - (ad.views ?? 0));

  const badge = useMemo(() => {
    if (isThisAdActive) {
      if (storeStatus === 'completed') return { label: 'Concluído', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
      if (storeStatus === 'paused')    return { label: 'Pausado',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' };
      if (storeStatus === 'opening')   return { label: 'Abrindo',   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' };
      return { label: 'Em andamento', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/25' };
    }
    return { label: 'Disponível', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
  }, [isThisAdActive, storeStatus]);

  const btn = useMemo(() => {
    if (isThisAdActive) {
      if (storeStatus === 'completed') return { label: 'Resgatar recompensa', cls: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20', icon: Gift, action: 'session' as const };
      if (storeStatus === 'viewing')   return { label: 'Ver progresso', cls: 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/20', icon: PlayCircle, action: 'session' as const };
      if (storeStatus === 'paused')    return { label: 'Aguardando retorno', cls: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20', icon: PauseCircle, action: 'session' as const };
      return { label: 'Abrindo...', cls: 'bg-orange-600 opacity-70 cursor-wait', icon: Loader2, action: 'none' as const };
    }
    if (isStarting) return { label: 'Iniciando...', cls: 'bg-orange-500 cursor-wait', icon: Loader2, action: 'none' as const };
    if (hasOtherSession) return { label: 'Abrir anúncio', cls: 'bg-gray-700 opacity-40 cursor-not-allowed', icon: ExternalLink, action: 'none' as const };
    return { label: 'Abrir anúncio', cls: 'bg-orange-500 hover:bg-orange-400 shadow-orange-500/20', icon: ExternalLink, action: 'start' as const };
  }, [isThisAdActive, storeStatus, isStarting, hasOtherSession]);

  function handleBtnClick() {
    if (btn.action === 'start') onStart(ad);
    else if (btn.action === 'session') onGoToSession();
  }

  const BtnIcon = btn.icon;

  return (
    <article
      className={`group bg-surface border rounded-3xl overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/40 ${
        isThisAdActive
          ? 'border-sky-500/30 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/10'
          : 'border-gray-800/50 hover:border-gray-700/70'
      }`}
    >
      <SitePreview url={ad.url} title={ad.title} isActive={isThisAdActive} />

      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Title + badge */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-white font-black text-sm uppercase italic tracking-tight leading-tight line-clamp-1 flex-1">
              {ad.title}
            </h3>
            <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-gray-500 text-xs font-medium leading-relaxed line-clamp-2 min-h-[2.5rem]">
            {ad.description || <span className="text-gray-700 italic">Sem descrição</span>}
          </p>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-800/70 rounded-lg px-2 py-1">
            <Timer className="w-3 h-3 text-gray-500" />
            <span className="text-gray-400 text-[10px] font-bold tabular-nums">{ad.durationSeconds}s</span>
          </div>
          {ad.targetViews != null && (
            <div className="flex items-center gap-1 bg-gray-800/70 rounded-lg px-2 py-1">
              <Eye className="w-3 h-3 text-gray-500" />
              <span className="text-gray-400 text-[10px] font-bold tabular-nums">
                {remainingViews.toLocaleString()} restantes
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-1 ml-auto">
            <img
              src="/shib.png"
              alt=""
              className="w-3 h-3 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="text-orange-300 font-black text-[10px] tabular-nums">
              +{Number(ad.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 0 })} SHIB
            </span>
          </div>
        </div>

        {/* Push button to bottom */}
        <div className="flex-1" />

        {/* CTA button */}
        <button
          onClick={handleBtnClick}
          disabled={btn.action === 'none'}
          aria-label={btn.label}
          className={`w-full py-3.5 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg ${btn.cls} disabled:pointer-events-none`}
        >
          <BtnIcon className={`w-4 h-4 ${btn.icon === Loader2 ? 'animate-spin' : ''}`} />
          {btn.label}
        </button>
      </div>
    </article>
  );
});

// ── Ad grid view ──────────────────────────────────────────────────────────────

function AdGridView({ onSelectAd }: { onSelectAd: (ad: PtcAd) => void }) {
  const [ads, setAds] = useState<PtcAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);

  const storeSession = usePtcSessionStore((s) => s.session);
  const storeStatus  = usePtcSessionStore((s) => s.status);
  const setStoreSession = usePtcSessionStore((s) => s.setSession);

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; ads: PtcAd[] }>('/ptc/ads');
      setAds(res.data.ads ?? []);
    } catch {
      toast.error('Erro ao carregar anúncios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAds(); }, [loadAds]);

  async function handleStart(ad: PtcAd) {
    if (storeSession) {
      toast.error('Você já possui um anúncio ativo. Conclua-o antes de iniciar outro.');
      return;
    }
    setStarting(ad.id);
    try {
      const res = await api.post<{ ok: boolean; session: { id: string } }>('/ptc/session/start', { adId: ad.id });
      if (!res.data.ok) { toast.error('Não foi possível iniciar sessão'); return; }

      setStoreSession(
        {
          sessionId: res.data.session.id,
          adId: ad.id,
          adTitle: ad.title,
          adUrl: ad.url,
          adType: ad.adType,
          requiredSeconds: ad.durationSeconds,
          rewardShib: ad.rewardPerViewShib,
        },
        'opening',
        0,
      );

      if (ad.adType === 'window') {
        window.open(ad.url, '_blank', 'noopener,noreferrer');
      }

      onSelectAd(ad);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erro ao iniciar sessão');
    } finally {
      setStarting(null);
    }
  }

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-surface border border-gray-800/50 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );

  if (ads.length === 0) return (
    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-16 text-center space-y-5">
      <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto">
        <Eye className="w-9 h-9 text-gray-700" />
      </div>
      <div>
        <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">Nenhum anúncio disponível</h3>
        <p className="text-gray-600 text-xs font-medium max-w-xs mx-auto leading-relaxed">
          Você já visualizou todos os anúncios disponíveis nas últimas 24 horas ou não há campanhas ativas no momento.
        </p>
      </div>
      <button
        onClick={() => void loadAds()}
        className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-colors"
      >
        <RefreshCw className="w-4 h-4" /> Verificar novamente
      </button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <StatsStrip ads={ads} />

      {/* Active session banner */}
      {storeSession && (
        <button
          onClick={() => onSelectAd({ id: storeSession.adId } as PtcAd)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/20 rounded-2xl hover:border-sky-500/40 transition-colors text-left group/banner"
        >
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse block" />
            <AlertCircle className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-xs text-sky-400/90 font-medium flex-1">
            Você possui um anúncio ativo. <strong className="font-black">Toque aqui</strong> para ver o progresso.
          </p>
          <PlayCircle className="w-4 h-4 text-sky-400 opacity-60 group-hover/banner:opacity-100 transition-opacity shrink-0" />
        </button>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">
          {ads.length} {ads.length === 1 ? 'anúncio disponível' : 'anúncios disponíveis'}
        </p>
        <button
          onClick={() => void loadAds()}
          title="Atualizar lista"
          className="p-2 rounded-xl text-gray-600 hover:text-white hover:bg-gray-800 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {ads.map((ad) => (
          <AdCard
            key={ad.id}
            ad={ad}
            storeSession={storeSession}
            storeStatus={storeStatus}
            isStarting={starting === ad.id}
            onStart={handleStart}
            onGoToSession={() => onSelectAd(ad)}
          />
        ))}
      </div>

      {/* Info note */}
      <div className="flex gap-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
          Ganhe <strong className="text-orange-300">SHIB</strong> por cada visualização completa.
          O contador avança apenas enquanto você está no site do anunciante.
        </p>
      </div>
    </div>
  );
}

// ── Active session view ────────────────────────────────────────────────────────

function ActiveSessionView({ onDone }: { onDone: () => void }) {
  const storeSession      = usePtcSessionStore((s) => s.session);
  const storeStatus       = usePtcSessionStore((s) => s.status);
  const storeAccumulatedMs = usePtcSessionStore((s) => s.accumulatedMs);
  const setStatus         = usePtcSessionStore((s) => s.setStatus);
  const clearSession      = usePtcSessionStore((s) => s.clear);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed]   = useState(false);

  const clockIso = useMemo(() => {
    if (!storeSession) return null;
    return new Date(Date.now() - storeAccumulatedMs).toISOString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSession?.sessionId]);

  const timerShouldRun = storeStatus === 'viewing' || storeStatus === 'paused';
  const { elapsed: localElapsed } = useActiveViewSeconds(clockIso, timerShouldRun);

  const requiredSeconds = storeSession?.requiredSeconds ?? 0;
  const displayElapsed  = storeStatus === 'completed'
    ? requiredSeconds
    : Math.min(localElapsed + storeAccumulatedMs / 1000, requiredSeconds);
  const remaining        = Math.max(0, requiredSeconds - displayElapsed);
  const isTimerComplete  = storeStatus === 'completed' || (timerShouldRun && remaining <= 0);
  const progress         = requiredSeconds > 0 ? Math.min(100, (displayElapsed / requiredSeconds) * 100) : 0;

  useDocumentTitleCountdown({
    remainingSeconds: remaining,
    isPaused:  storeStatus === 'paused' || storeStatus === 'opening',
    isActive:  timerShouldRun || storeStatus === 'opening',
    isComplete: isTimerComplete,
    pageName: 'PTC',
  });

  const statusMeta = useMemo(() => {
    switch (storeStatus) {
      case 'opening':   return { label: 'Abrindo anúncio...', color: 'text-amber-400',   ring: 'ring-amber-500/30',   bg: 'from-amber-950/30',   Icon: Loader2 };
      case 'viewing':   return { label: 'Visualizando',       color: 'text-sky-300',      ring: 'ring-sky-500/30',     bg: 'from-sky-950/30',     Icon: Eye };
      case 'paused':    return { label: 'Pausado',            color: 'text-amber-400',   ring: 'ring-amber-500/30',   bg: 'from-amber-950/30',   Icon: PauseCircle };
      case 'completed': return { label: 'Concluído!',         color: 'text-emerald-400', ring: 'ring-emerald-500/30', bg: 'from-emerald-950/30', Icon: CheckCircle2 };
      case 'cancelled': return { label: 'Cancelado',          color: 'text-red-400',     ring: 'ring-red-500/30',     bg: 'from-red-950/30',     Icon: XCircle };
      default: return null;
    }
  }, [storeStatus]);

  async function handleClaim() {
    if (!storeSession || claiming) return;
    setClaiming(true);
    try {
      const res = await api.post<{ ok: boolean; message?: string }>(`/ptc/session/${storeSession.sessionId}/claim`);
      if (res.data.ok) {
        setStatus('claimed');
        setClaimed(true);
        toast.success(`+${Number(storeSession.rewardShib).toLocaleString(undefined, { maximumFractionDigits: 4 })} SHIB creditado!`);
        setTimeout(() => { clearSession(); onDone(); }, 2500);
      } else {
        toast.error(res.data.message ?? 'Erro ao resgatar');
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erro ao resgatar recompensa');
      if (msg && /indisponível|registrada|expirada|cooldown|cancelada/i.test(msg)) {
        try {
          await api.post(`/ptc/session/${storeSession.sessionId}/cancel`, { reason: 'claim_failed' });
        } catch { /* non-fatal */ }
        clearSession();
        onDone();
      }
    } finally {
      setClaiming(false);
    }
  }

  async function handleCancel() {
    if (!storeSession) return;
    try {
      await api.post(`/ptc/session/${storeSession.sessionId}/cancel`, { reason: 'user_cancelled' });
    } catch { /* non-fatal */ }
    clearSession();
    onDone();
  }

  if (!storeSession) return null;

  const StatusIcon = statusMeta?.Icon ?? Eye;
  const domain     = extractDomain(storeSession.adUrl);
  const gradient   = domainToGradient(domain);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Back button */}
      <button
        onClick={() => {
          if (storeStatus === 'cancelled' || storeStatus === 'claimed') { clearSession(); onDone(); }
          else void handleCancel();
        }}
        className="flex items-center gap-1.5 text-gray-600 hover:text-white text-xs font-black uppercase tracking-widest transition-colors"
      >
        ← Voltar à lista
      </button>

      {/* Main card */}
      <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] overflow-hidden">
        {/* Top gradient with site info */}
        <div className="relative px-8 pt-8 pb-6" style={{ background: gradient }}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
          <div className="relative flex items-end justify-between gap-4">
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">{domain}</p>
              <h2 className="text-white font-black text-xl uppercase italic tracking-tight leading-tight">
                {storeSession.adTitle}
              </h2>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5 bg-orange-500/20 border border-orange-500/30 rounded-xl px-3 py-1.5 backdrop-blur-sm">
                <img
                  src="/shib.png"
                  alt=""
                  className="w-4 h-4 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-orange-300 font-black text-xs">
                  +{Number(storeSession.rewardShib).toLocaleString(undefined, { maximumFractionDigits: 4 })} SHIB
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* iframe viewer */}
        {storeSession.adType === 'iframe' && storeStatus !== 'idle' && (
          <div className="mx-6 mt-0 rounded-2xl overflow-hidden border border-gray-700 bg-gray-900">
            <iframe
              src={storeSession.adUrl}
              title={storeSession.adTitle}
              className="w-full"
              style={{ height: 250, border: 0 }}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        )}

        {/* Status + timer block */}
        <div className="p-6 space-y-5">
          {statusMeta && !claimed && (
            <div className={`rounded-2xl bg-gradient-to-b ${statusMeta.bg} to-transparent ring-1 ${statusMeta.ring} px-6 py-6 text-center space-y-4 transition-all duration-500`}>
              {/* Status label */}
              <p className={`text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 ${statusMeta.color}`}>
                <StatusIcon className={`w-3.5 h-3.5 ${storeStatus === 'opening' || storeStatus === 'viewing' ? 'animate-pulse' : ''}`} />
                {statusMeta.label}
              </p>

              {/* Timer */}
              {['opening', 'viewing', 'paused'].includes(storeStatus) && (
                <div className="space-y-3">
                  <div className="flex items-end justify-center gap-2">
                    <span className="text-5xl sm:text-6xl font-black tabular-nums tracking-tight text-white">
                      {fmtTime(displayElapsed)}
                    </span>
                    <span className="text-2xl text-gray-600 font-black tabular-nums mb-1">
                      / {fmtTime(requiredSeconds)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        storeStatus === 'paused' ? 'bg-amber-500' : 'bg-sky-500 shadow-[0_0_8px_theme(colors.sky.500)]'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-gray-600 font-medium">
                    {storeStatus === 'paused'
                      ? 'Volte ao site do anunciante para continuar.'
                      : storeStatus === 'opening'
                        ? 'Aguardando atividade no site do anunciante...'
                        : 'Permaneça no site do anunciante até o tempo ser concluído.'}
                  </p>
                </div>
              )}

              {storeStatus === 'cancelled' && (
                <p className="text-sm text-red-400/70 font-medium">Visualização encerrada antes do tempo mínimo.</p>
              )}
            </div>
          )}

          {/* Cancel button */}
          {['opening', 'viewing', 'paused'].includes(storeStatus) && (
            <button
              onClick={() => void handleCancel()}
              className="w-full py-3 bg-gray-800/60 text-gray-500 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-700/60 hover:text-white transition-colors"
            >
              Cancelar visualização
            </button>
          )}

          {/* Claim button */}
          {(storeStatus === 'completed' || isTimerComplete) && !claimed && (
            <button
              onClick={() => void handleClaim()}
              disabled={claiming}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3 text-sm italic shadow-xl shadow-emerald-600/25 animate-bounce disabled:opacity-70 disabled:scale-100 disabled:animate-none"
            >
              {claiming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
              Resgatar recompensa SHIB!
            </button>
          )}

          {/* Claimed state */}
          {claimed && (
            <div className="flex items-center justify-center gap-3 py-5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 animate-in fade-in duration-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <span className="text-emerald-400 font-black uppercase italic tracking-tighter text-lg">SHIB Creditado!</span>
              <Loader2 className="w-4 h-4 text-gray-600 animate-spin ml-2" />
            </div>
          )}
        </div>
      </div>

      {/* Tip */}
      <div className="flex gap-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
          O contador avança <strong className="text-white">somente enquanto você está no site do anunciante</strong>.
          Fechar a aba ou retornar ao BlockMiner pausa o contador.
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PtcViewPage() {
  const [settings, setSettings] = useState<PtcSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [viewingAd, setViewingAd] = useState(false);

  const storeSession       = usePtcSessionStore((s) => s.session);
  const storeStatus        = usePtcSessionStore((s) => s.status);
  const storeAccumulatedMs = usePtcSessionStore((s) => s.accumulatedMs);
  const setStoreSession    = usePtcSessionStore((s) => s.setSession);
  const clearSession       = usePtcSessionStore((s) => s.clear);

  // suppress unused-var lint for storeAccumulatedMs (referenced by store)
  void storeAccumulatedMs;

  // On mount: recover active session
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [settingsRes, sessionRes] = await Promise.all([
          api.get<{ ok: boolean; settings: PtcSettings }>('/ptc/settings'),
          api.get<{ ok: boolean; session: SessionApiResponse | null }>('/ptc/session/active'),
        ]);
        setSettings(settingsRes.data.settings);

        const active = sessionRes.data.session;
        if (active) {
          const adData = active.ad;
          setStoreSession(
            {
              sessionId:       active.id,
              adId:            adData.id,
              adTitle:         adData.title,
              adUrl:           adData.url,
              adType:          adData.adType,
              requiredSeconds: adData.durationSeconds,
              rewardShib:      adData.rewardPerViewShib,
            },
            active.status as 'opening' | 'viewing' | 'paused' | 'completed',
            active.accumulatedMs,
          );
          setViewingAd(true);
        } else {
          clearSession();
        }
      } catch {
        toast.error('Erro ao carregar PTC');
      } finally {
        setLoading(false);
      }
    };
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInActiveSession = Boolean(storeSession) &&
    ['opening', 'viewing', 'paused', 'completed'].includes(storeStatus);
  const showViewingMode = viewingAd || isInActiveSession;

  if (loading) return (
    <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!settings?.isEnabled) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <p className="text-gray-500 font-black uppercase tracking-widest text-sm">
        Sistema PTC temporariamente desabilitado
      </p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">PTC — Ganhe SHIB</h1>
          <p className="text-gray-500 text-sm font-medium mt-1">
            Visualize anúncios e ganhe{' '}
            <span className="text-orange-400 font-black">SHIBA INU</span>{' '}
            por cada view completa
          </p>
        </div>
        <Link
          to="/ptc/campaigns"
          className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all hover:scale-[1.02] shadow-lg shadow-orange-500/20 shrink-0"
        >
          <Megaphone className="w-4 h-4" />
          Minhas Campanhas
        </Link>
      </div>

      {showViewingMode ? (
        <div className="max-w-2xl mx-auto w-full">
          <ActiveSessionView onDone={() => setViewingAd(false)} />
        </div>
      ) : (
        <AdGridView onSelectAd={() => setViewingAd(true)} />
      )}

      <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="ptc-view-bottom" />
    </div>
  );
}
