import { useState, useEffect, useCallback, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Youtube, Zap, Clock, TrendingUp, AlertCircle, History, BarChart3, ShieldCheck, X, PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { api } from '../../store/auth';
import { formatHashrate } from '../../shared/utils/machine';
import PowerBoostBanner from '../../components/PowerBoostBanner/PowerBoostBanner';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import { validateTrustedEvent, generateSecurityPayload } from '../../shared/utils/security';
import { reportApiFailure } from '../../shared/utils/reportApiFailure';
import { useBrazilDailyResetCountdown } from '../../shared/hooks/useBrazilDailyResetCountdown';

interface YoutubeDailyReset {
    timezone: string;
    localDate: string;
    nextResetAt: string;
    nextResetInMs: number;
}

interface YoutubeStatusPayload {
    ok?: boolean;
    rewardGh?: number;
    durationMin?: number;
    activeHashRate?: number;
}

interface YoutubeStatsPayload {
    ok?: boolean;
    hashGranted24h?: number;
    dailyLimit?: number;
    dailyRemainingHash?: number;
    dailyLimitMinutes?: number;
    dailyMinutesUsed?: number;
    dailyRemainingMinutes?: number;
    activeHashTotal?: number;
    dailyReset?: YoutubeDailyReset;
    claims24h?: number;
    claimsTotal?: number;
    hashGrantedTotal?: number;
    watchSecondsBalance?: number;
    minSecondsToClaim?: number;
}

interface YoutubeClaimResponse {
    ok?: boolean;
    rewardGh?: number;
    retryAfterMs?: number;
}

type TrackerColor = 'primary' | 'amber' | 'blue' | 'emerald';

const CLAIM_INTERVAL_SEC = 60;
const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function isValidYoutubeVideoId(id: string | null | undefined): id is string {
    return typeof id === 'string' && YOUTUBE_VIDEO_ID_RE.test(id);
}

type PlayerUiState = 'idle' | 'cued' | 'playing' | 'buffering' | 'paused' | 'ended';

export default function YouTubeWatch() {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [videoId, setVideoId] = useState<string | null>(null);
    const [playerState, setPlayerState] = useState<PlayerUiState>('idle');
    const [countdown, setCountdown] = useState(CLAIM_INTERVAL_SEC);
    const [status, setStatus] = useState<YoutubeStatusPayload | null>(null);
    const [stats, setStats] = useState<YoutubeStatsPayload | null>(null);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isClaimingRef = useRef(false);
    const playerRef = useRef<YT.Player | null>(null);
    const playerDivRef = useRef<HTMLDivElement | null>(null);
    const ytReadyRef = useRef(false);
    const [ytApiReady, setYtApiReady] = useState(() => Boolean(window.YT?.Player));
    const [ytApiFailed, setYtApiFailed] = useState(false);
    const [playerReady, setPlayerReady] = useState(false);
    const cycleStartRef = useRef<number | null>(null);
    const urlInputRef = useRef<HTMLInputElement | null>(null);
    const urlComposingRef = useRef(false);
    const [playerResetKey, setPlayerResetKey] = useState(0);
    const [watchCycleActive, setWatchCycleActive] = useState(false);

    const isActivelyWatching = playerState === 'playing' || playerState === 'buffering';

    const resetWatchCycle = useCallback(() => {
        cycleStartRef.current = null;
        setWatchCycleActive(false);
        setCountdown(CLAIM_INTERVAL_SEC);
    }, []);

    const playerStateLabel = useCallback(
        (state: PlayerUiState) => {
            const key = `youtube.player_state_${state}` as const;
            return t(key);
        },
        [t],
    );

    /**
     * Selects the full URL when the field has text (focus, click, Tab). Skipped during IME composition.
     */
    const selectAllUrl = useCallback(() => {
        const el = urlInputRef.current;
        if (!el || urlComposingRef.current) return;
        const len = el.value.length;
        if (len === 0) return;
        requestAnimationFrame(() => {
            el.setSelectionRange(0, len);
        });
    }, []);

    /**
     * Clears the URL, stops the player, and returns focus to the input for immediate typing.
     */
    const handleClearUrl = useCallback((e: MouseEvent<HTMLButtonElement>) => {
        if (!validateTrustedEvent(e)) return;
        setUrl('');
        setPlayerState('idle');
        resetWatchCycle();
        setPlayerReady(false);
        if (playerRef.current) {
            try {
                playerRef.current.destroy();
            } catch (_) {
                /* ignore */
            }
            playerRef.current = null;
        }
        setVideoId(null);
        setPlayerResetKey((k) => k + 1);
        requestAnimationFrame(() => {
            urlInputRef.current?.focus();
        });
    }, [resetWatchCycle]);

    // Carrega a YouTube IFrame API uma vez (com poll — callback pode ter disparado antes).
    useEffect(() => {
        const markReady = () => {
            ytReadyRef.current = true;
            setYtApiReady(true);
            setYtApiFailed(false);
        };

        if (window.YT?.Player) {
            markReady();
            return undefined;
        }

        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            markReady();
            if (typeof prev === 'function') prev();
        };

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            tag.async = true;
            document.head.appendChild(tag);
        }

        const poll = window.setInterval(() => {
            if (window.YT?.Player) {
                markReady();
                window.clearInterval(poll);
            }
        }, 250);

        const timeout = window.setTimeout(() => {
            window.clearInterval(poll);
            if (!window.YT?.Player) {
                setYtApiFailed(true);
                toast.error(t('youtube.api_load_failed'), { duration: 8000 });
            }
        }, 20_000);

        return () => {
            window.clearInterval(poll);
            window.clearTimeout(timeout);
        };
    }, [t]);

    // Destrói o player ao desmontar o componente
    useEffect(() => {
        return () => {
            if (playerRef.current) {
                try { playerRef.current.destroy(); } catch (_) {}
                playerRef.current = null;
            }
        };
    }, []);

    const normalizeVideoId = (candidate: string | null | undefined): string | null => {
        const id = String(candidate ?? '').trim();
        return isValidYoutubeVideoId(id) ? id : null;
    };

    const extractVideoId = (input: unknown): string | null => {
        const raw = String(input || "").trim();

        // 1. Check if it's already an 11-char ID
        const direct = normalizeVideoId(raw);
        if (direct) return direct;

        // 2. Try to parse as URL
        try {
            const urlObj = new URL(raw);
            const hostname = urlObj.hostname.replace(/^www\./, "").toLowerCase();

            // youtu.be/ID
            if (hostname === "youtu.be") {
                const fromPath = normalizeVideoId(urlObj.pathname.slice(1).split(/[?#&]/)[0]);
                if (fromPath) return fromPath;
            }

            if (hostname === "youtube.com" || hostname === "m.youtube.com") {
                // /watch?v=ID
                if (urlObj.pathname === "/watch") {
                    const fromQuery = normalizeVideoId(urlObj.searchParams.get("v"));
                    if (fromQuery) return fromQuery;
                }
                // /embed/ID, /v/ID, /shorts/ID, /live/ID
                const parts = urlObj.pathname.split("/");
                if (["embed", "v", "shorts", "live"].includes(parts[1])) {
                    const fromPath = normalizeVideoId(parts[2]);
                    if (fromPath) return fromPath;
                }
            }
        } catch (e) {
            // Ignore URL parsing errors and try regex
        }

        // 3. Robust Regex Fallback (handles most common formats including timestamps and feature params)
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = raw.match(regex);
        if (match?.[1]) return normalizeVideoId(match[1]);

        return null;
    };

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get<YoutubeStatusPayload>('/youtube/status');
            if (res.data.ok) {
                setStatus(res.data);
            }
        } catch (err: unknown) {
            console.error(err);
        }
    }, []);

    const fetchUserStats = useCallback(async () => {
        try {
            const res = await api.get<YoutubeStatsPayload>('/youtube/stats');
            if (res.data.ok) setStats(res.data);
        } catch (err: unknown) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchUserStats();
    }, [fetchStatus, fetchUserStats]);

    const handleLoadVideo = (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLInputElement>) => {
        if (!validateTrustedEvent(e)) return;
        const id = extractVideoId(url);
        if (!id) {
            toast.error(t('youtube.invalid_url'));
            return;
        }
        setPlayerState('idle');
        resetWatchCycle();
        setPlayerReady(false);
        // Sempre destrói o player antes de criar um novo — evita estado inválido
        if (playerRef.current) {
            try { playerRef.current.destroy(); } catch (_) {}
            playerRef.current = null;
        }
        setVideoId(id);
        setPlayerResetKey(k => k + 1);
        toast.success(t('youtube.video_loaded'));
    };

    const handleExternalYoutubeClick = useCallback(() => {
        toast.warning(t('youtube.external_watch_warning'), { duration: 8000 });
    }, [t]);

    // Inicializa o player YT quando videoId, reset key e API estão prontos
    useEffect(() => {
        if (!videoId || !playerDivRef.current || !ytApiReady) return undefined;
        if (playerRef.current) return undefined;

        let cancelled = false;

        const initPlayer = () => {
            if (cancelled || !playerDivRef.current || playerRef.current) return;
            if (!isValidYoutubeVideoId(videoId)) {
                toast.error(t('youtube.invalid_url'));
                setVideoId(null);
                setPlayerState('idle');
                resetWatchCycle();
                return;
            }
            try {
                playerRef.current = new window.YT!.Player(playerDivRef.current, {
                    videoId,
                    width: '100%',
                    height: '100%',
                    playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
                    events: {
                        onReady: () => {
                            if (cancelled) return;
                            setPlayerReady(true);
                            setPlayerState((prev) => {
                                if (prev === 'idle') {
                                    toast.info(t('youtube.click_to_play'), { duration: 4000 });
                                    return 'cued';
                                }
                                return prev;
                            });
                        },
                        onError: (event: { data: number }) => {
                            if (event.data === 101 || event.data === 150) {
                                toast.error(t('youtube.video_error_embed'), { duration: 8000 });
                            } else {
                                toast.error(t('youtube.video_error'), { duration: 5000 });
                            }
                            setPlayerState('idle');
                            setPlayerReady(false);
                            resetWatchCycle();
                        },
                        onStateChange: (event: { data: number }) => {
                            const YTState = window.YT!.PlayerState;
                            if (event.data === YTState.PLAYING) {
                                setPlayerState('playing');
                            } else if (event.data === YTState.BUFFERING) {
                                setPlayerState('buffering');
                            } else if (event.data === YTState.PAUSED) {
                                setPlayerState('paused');
                            } else if (event.data === YTState.ENDED) {
                                setPlayerState('ended');
                            } else if (event.data === YTState.CUED) {
                                setPlayerState('cued');
                            } else {
                                setPlayerState('idle');
                            }
                        },
                    },
                });
            } catch {
                toast.error(t('youtube.invalid_url'));
                setVideoId(null);
                setPlayerState('idle');
                setPlayerReady(false);
                resetWatchCycle();
            }
        };

        initPlayer();

        return () => {
            cancelled = true;
        };
    }, [videoId, playerResetKey, ytApiReady, t, resetWatchCycle]);

    const claimReward = useCallback(async () => {
        if (isClaimingRef.current) return;
        isClaimingRef.current = true;
        let scheduleRetry = false;
        let retryDelay = 0;
        try {
            const res = await api.post<YoutubeClaimResponse>('/youtube/claim', { videoId });
            if (res.data.ok) {
                toast.success(
                    t('youtube.claim_applied', {
                        reward: formatHashrate(Number(res.data.rewardGh) || 0),
                    })
                );
                fetchStatus();
                fetchUserStats();
                resetWatchCycle();
                if (playerState === 'playing' || playerState === 'buffering') {
                    cycleStartRef.current = Date.now();
                    setWatchCycleActive(true);
                }
            }
        } catch (err: unknown) {
            if (isAxiosError(err) && err.response?.status === 400) {
                const data = err.response.data as { message?: string; retryAfterMs?: number } | null;
                const retryAfterMs = data?.retryAfterMs;
                if (retryAfterMs != null && retryAfterMs > 0) {
                    // Insufficient watch time — silently retry without stopping the timer
                    scheduleRetry = true;
                    retryDelay = retryAfterMs;
                } else {
                    const msg = data?.message ?? '';
                    const isDaily =
                        /limite diário|daily limit/i.test(msg);
                    toast.error(isDaily ? t('youtube.daily_limit_reached') : (msg || t('youtube.claim_failed')));
                    if (isDaily) setPlayerState('paused');
                }
            } else {
                // Falha inesperada (5xx, 401 sessão expirada, rede) — reporta p/ o admin ver.
                const status = isAxiosError(err) ? err.response?.status : undefined;
                const code = isAxiosError(err)
                    ? (err.response?.data as { code?: string } | null)?.code
                    : undefined;
                const serverMsg = isAxiosError(err)
                    ? (err.response?.data as { message?: string } | null)?.message
                    : undefined;
                toast.error(t('youtube.claim_failed'));
                reportApiFailure({
                    operation: 'youtube_claim',
                    message: serverMsg || (err instanceof Error ? err.message : 'claim_failed'),
                    statusCode: status,
                    code,
                    context: { videoId, hasResponse: isAxiosError(err) ? !!err.response : false },
                });
                // Evita rajada de erros: reinicia o ciclo de 60s antes de tentar de novo.
                // Sem isso, o timer de 500ms dispararia o claim novamente a cada tick.
                cycleStartRef.current = Date.now();
                if (status === 401) {
                    // Sessão expirada — não adianta continuar assistindo; pausa o ciclo.
                    setPlayerState('paused');
                }
            }
        } finally {
            isClaimingRef.current = false;
        }
        if (scheduleRetry) {
            setTimeout(() => void claimReward(), retryDelay);
        }
    }, [videoId, fetchStatus, fetchUserStats, t, resetWatchCycle, playerState]);

    // Heartbeat — só enquanto PLAYING/BUFFERING; mantém saldo no servidor para o claim.
    useEffect(() => {
        if (!isActivelyWatching) return;
        const sendHeartbeat = async () => {
            try {
                const security = generateSecurityPayload();
                await api.post('/session/heartbeat', { type: 'youtube', security });
                void fetchUserStats();
            } catch (err: unknown) {
                if (isAxiosError(err) && err.response?.status === 400) {
                    const code =
                        typeof err.response.data === 'object' && err.response.data !== null
                            ? (err.response.data as { code?: string }).code
                            : undefined;
                    if (code === 'FINGERPRINT_STALE' || code === 'FINGERPRINT_DECODE_FAILED') {
                        try {
                            const security = generateSecurityPayload();
                            await api.post('/session/heartbeat', { type: 'youtube', security });
                            void fetchUserStats();
                        } catch {
                            /* next interval retries */
                        }
                    }
                }
            }
        };
        void sendHeartbeat();
        const heartbeatInterval = setInterval(sendHeartbeat, 10000);
        return () => clearInterval(heartbeatInterval);
    }, [isActivelyWatching, fetchUserStats]);

    // Timer: acumula tempo de relógio só em PLAYING/BUFFERING; pausa não zera o ciclo de 60s.
    useEffect(() => {
        if (timerRef.current != null) clearInterval(timerRef.current);
        if (!isActivelyWatching) return undefined;

        if (cycleStartRef.current == null) {
            cycleStartRef.current = Date.now();
            setWatchCycleActive(true);
        }

        timerRef.current = setInterval(() => {
            if (!cycleStartRef.current) return;
            const elapsed = (Date.now() - cycleStartRef.current) / 1000;
            const remaining = Math.max(0, Math.round(CLAIM_INTERVAL_SEC - elapsed));
            setCountdown(remaining);
            if (elapsed >= CLAIM_INTERVAL_SEC) {
                cycleStartRef.current = Date.now();
                void claimReward();
            }
        }, 500);
        return () => {
            if (timerRef.current != null) clearInterval(timerRef.current);
            timerRef.current = null;
        };
    }, [isActivelyWatching, claimReward]);

    const dailyLimitHash = Number(stats?.dailyLimit ?? 1000);
    const dailyHashUsed = Number(stats?.hashGranted24h ?? 0);
    const dailyHashRemaining = Number(stats?.dailyRemainingHash ?? Math.max(0, dailyLimitHash - dailyHashUsed));
    const dailyReset = stats?.dailyReset ?? null;
    const activeHashTotal = Number(stats?.activeHashTotal ?? status?.activeHashRate ?? 0);
    const claimsToday = Number(stats?.claims24h ?? 0);
    const dailyProgress = dailyLimitHash > 0 ? (dailyHashUsed / dailyLimitHash) * 100 : 0;
    const minClaimSec = Number(stats?.minSecondsToClaim ?? 50);
    const watchBalance = Number(stats?.watchSecondsBalance ?? 0);
    const showClaimCountdown =
        videoId != null &&
        (isActivelyWatching || playerState === 'paused') &&
        watchCycleActive;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <PowerBoostBanner />
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-red-500/10 rounded-2xl">
                        <Youtube className="w-6 h-6 text-red-500" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('youtube.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('youtube.subtitle')}</p>
                </div>
                <div className="bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shadow-glow-sm">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="text-primary font-black text-[10px] uppercase tracking-widest">{t('youtube.protocol_active')}</span>
                </div>
            </div>

            {dailyReset ? (
                <YoutubeDailyResetBanner dailyReset={dailyReset} t={t} onResetElapsed={fetchUserStats} />
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Video Area */}
                <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-bl-[120px] -mr-20 -mt-20 group-hover:bg-red-500/10 transition-colors" />
                        
                        <div className="flex flex-col sm:flex-row gap-3 mb-6 sm:mb-8 relative z-10">
                            <div className="relative flex-1 min-w-0">
                                <input
                                    ref={urlInputRef}
                                    type="text"
                                    value={url}
                                    inputMode="url"
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-label={t('youtube.url_placeholder')}
                                    onChange={(e) => setUrl(e.target.value)}
                                    onFocus={selectAllUrl}
                                    onClick={selectAllUrl}
                                    onCompositionStart={() => {
                                        urlComposingRef.current = true;
                                    }}
                                    onCompositionEnd={() => {
                                        urlComposingRef.current = false;
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleLoadVideo(e);
                                    }}
                                    placeholder={t('youtube.url_placeholder')}
                                    className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-3 sm:py-4 pl-4 sm:pl-6 pr-12 sm:pr-14 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                                />
                                <button
                                    type="button"
                                    title={t('youtube.clear_url_tooltip')}
                                    aria-label={t('youtube.clear_url_aria')}
                                    aria-hidden={url.length === 0}
                                    tabIndex={url.length > 0 ? 0 : -1}
                                    disabled={url.length === 0}
                                    onClick={handleClearUrl}
                                    className={`absolute right-1.5 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-xl border border-gray-700/60 bg-gray-800/90 text-gray-400 shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-gray-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95 disabled:pointer-events-none sm:right-2 sm:h-9 sm:w-9 ${
                                        url.length > 0 ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95'
                                    }`}
                                >
                                    <X className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={handleLoadVideo}
                                className="shrink-0 px-6 sm:px-8 py-3 sm:py-4 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all italic shadow-lg shadow-primary/20"
                            >
                                {t('youtube.load_video')}
                            </button>
                        </div>

                        <div className="aspect-video bg-gray-900 rounded-[2rem] overflow-hidden border border-gray-800 relative group shadow-inner">
                            <div ref={playerDivRef} className="w-full h-full" />
                            {!videoId && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                                    <Youtube className="w-20 h-20 mb-4 opacity-20" />
                                    <p className="font-bold uppercase tracking-widest text-[10px]">{t('youtube.waiting_placeholder')}</p>
                                </div>
                            )}
                            {videoId && (!ytApiReady || !playerReady) && !ytApiFailed && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-950/90">
                                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                        {t('youtube.player_loading')}
                                    </p>
                                </div>
                            )}
                            {videoId && ytApiFailed && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-950/95 px-6 text-center">
                                    <AlertCircle className="h-10 w-10 text-amber-400" />
                                    <p className="text-sm text-gray-300">{t('youtube.api_load_failed')}</p>
                                    <a
                                        href={`https://www.youtube.com/watch?v=${videoId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase text-white"
                                    >
                                        <Youtube className="h-4 w-4" />
                                        {t('youtube.open_on_youtube')}
                                    </a>
                                </div>
                            )}
                            {videoId && (
                                <a
                                    href={`https://www.youtube.com/watch?v=${videoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={handleExternalYoutubeClick}
                                    className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/10 transition-all backdrop-blur-sm"
                                >
                                    <Youtube className="w-3 h-3" /> {t('youtube.open_on_youtube')}
                                </a>
                            )}
                        </div>

                        {videoId && playerState === 'ended' && (
                            <div className="mt-4 flex items-start gap-3 p-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 relative z-10">
                                <PlayCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-100/90 font-medium leading-relaxed">
                                    {t('youtube.video_ended_hint')}
                                </p>
                            </div>
                        )}

                        {videoId && (
                            <div className="mt-4 flex flex-wrap items-center gap-2 relative z-10">
                                <span
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                                        isActivelyWatching
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                            : playerState === 'paused'
                                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                              : playerState === 'ended'
                                                ? 'bg-gray-800 border-gray-700 text-gray-400'
                                                : 'bg-gray-800/80 border-gray-700 text-gray-500'
                                    }`}
                                >
                                    {isActivelyWatching ? (
                                        <Clock className="w-3 h-3" />
                                    ) : playerState === 'paused' ? (
                                        <PauseCircle className="w-3 h-3" />
                                    ) : (
                                        <PlayCircle className="w-3 h-3" />
                                    )}
                                    {playerStateLabel(playerState)}
                                </span>
                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                    {t('youtube.tracker_verified_seconds')}:{' '}
                                    <span className={watchBalance >= minClaimSec ? 'text-emerald-400' : 'text-white'}>
                                        {watchBalance}s
                                    </span>
                                    {' / '}
                                    {minClaimSec}s
                                </span>
                            </div>
                        )}

                        <div className="mt-4 sm:mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
                            <div className="flex items-center gap-4">
                                {showClaimCountdown && (
                                    <div className="flex items-center gap-3 px-6 py-4 bg-gray-800/50 rounded-2xl border border-gray-700/50 shadow-inner">
                                        <Clock className={`w-4 h-4 text-primary ${isActivelyWatching ? 'animate-pulse' : ''}`} />
                                        <span className="text-sm font-bold text-white uppercase italic tracking-tighter">
                                            {t('youtube.next_claim', { seconds: countdown })}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="text-[10px] text-gray-500 italic font-medium max-w-[220px] text-right flex items-start gap-1">
                                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500/60" />
                                    <span>
                                        {t('youtube.embed_hint_before')}{' '}
                                        <strong className="text-white">{t('youtube.open_on_youtube')}</strong>{' '}
                                        {t('youtube.embed_hint_after')}
                                    </span>
                                </div>
                        </div>
                    </div>
                </div>

                {/* Reward Tracker Sidebar */}
                <div className="space-y-4 sm:space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -mr-10 -mt-10" />
                        
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-primary" /> {t('youtube.tracker_title')}
                        </h3>
                        
                        <div className="space-y-6 relative z-10">
                            <TrackerItem
                                label={t('youtube.tracker_next')}
                                value={showClaimCountdown ? `${countdown}s` : '--'}
                                icon={Clock}
                                color="primary"
                            />
                            <TrackerItem
                                label={t('youtube.tracker_verified_seconds')}
                                value={`${watchBalance}s`}
                                icon={ShieldCheck}
                                color="blue"
                            />
                            <TrackerItem label={t('youtube.tracker_per_minute')} value={formatHashrate(Number(status?.rewardGh || 10))} icon={Zap} color="amber" />
                            <TrackerItem label={t('youtube.tracker_duration')} value={`${Number(status?.durationMin || 1440)} min`} icon={History} color="blue" />
                            <div className="h-[1px] bg-gray-800 w-full my-2" />
                            <TrackerItem label={t('youtube.tracker_bonus')} value={formatHashrate(status?.activeHashRate || 0)} icon={TrendingUp} color="emerald" />
                        </div>
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 space-y-6 shadow-2xl">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">{t('youtube.stats_claims_today')}</span>
                                <span className="text-white">{claimsToday}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">{t('youtube.stats_hash_today')}</span>
                                <span className="text-emerald-400">{formatHashrate(dailyHashUsed)} / {formatHashrate(dailyLimitHash)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">{t('youtube.stats_hash_remaining')}</span>
                                <span className="text-gray-400">{formatHashrate(dailyHashRemaining)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">{t('youtube.stats_active_hash')}</span>
                                <span className="text-primary">{formatHashrate(activeHashTotal)}</span>
                            </div>
                            <p className="text-[9px] text-gray-600 font-bold uppercase leading-relaxed">{t('youtube.stats_active_hash_note')}</p>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-bold text-gray-600 uppercase">{t('youtube.stats_daily_progress')}</span>
                                    <span className="text-[9px] font-bold text-gray-400">{dailyProgress.toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                    <div 
                                        className="h-full bg-gradient-to-r from-primary to-blue-500 transition-all duration-1000" 
                                        style={{ width: `${Math.min(100, dailyProgress)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="h-[1px] bg-gray-800 w-full" />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">{t('youtube.stats_claims_all')}</span>
                                <span className="text-white">{stats?.claimsTotal || 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">{t('youtube.stats_hash_all')}</span>
                                <span className="text-primary">{formatHashrate(Number(stats?.hashGrantedTotal || 0))}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TrackerItem({
    label,
    value,
    icon: Icon,
    color,
}: {
    label: string;
    value: string;
    icon: LucideIcon;
    color: TrackerColor;
}) {
    const colorMap: Record<TrackerColor, string> = {
        primary: 'text-primary bg-primary/10',
        amber: 'text-amber-500 bg-amber-500/10',
        blue: 'text-blue-500 bg-blue-500/10',
        emerald: 'text-emerald-500 bg-emerald-500/10',
    };
    return (
        <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${colorMap[color]} group-hover:scale-110 transition-transform`}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
            </div>
            <span className="text-sm font-black text-white italic">{value}</span>
        </div>
    );
}

function YoutubeDailyResetBanner({
    dailyReset,
    t,
    onResetElapsed,
}: {
    dailyReset: YoutubeDailyReset;
    t: ReturnType<typeof useTranslation>['t'];
    onResetElapsed: () => Promise<void>;
}) {
    const { label, remainingMs } = useBrazilDailyResetCountdown(dailyReset.nextResetInMs);

    useEffect(() => {
        if (remainingMs > 0) return undefined;
        void onResetElapsed();
        return undefined;
    }, [remainingMs, onResetElapsed]);

    return (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">
                    {t('youtube.daily_reset_title', { date: dailyReset.localDate })}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400">{t('youtube.daily_reset_body')}</p>
            </div>
            <div className="shrink-0 text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t('youtube.daily_reset_next')}</p>
                <p className="text-lg font-black tabular-nums text-emerald-300">{label}</p>
            </div>
        </div>
    );
}
