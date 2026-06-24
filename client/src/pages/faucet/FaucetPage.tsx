import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
    Gift,
    Clock,
    Zap,
    AlertCircle,
    CheckCircle2,
    Timer,
    Lock,
    Unlock,
    MousePointer2,
    Info,
    ExternalLink,
    Loader2,
    Infinity
} from 'lucide-react';
import { api } from '../../store/auth';
import type { AxiosError } from 'axios';
import PowerBoostBanner from '../../components/PowerBoostBanner/PowerBoostBanner';
import MondiadBanner from '../../shared/components/MondiadBanner';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';

interface FaucetReward {
    imageUrl?: string | null;
    name?: string | null;
    hashRate?: number | string | null;
    inventoryPermanent?: boolean;
}

interface FaucetStatus {
    ok?: boolean;
    remainingMs?: number;
    canClaim?: boolean;
    partnerReady?: boolean;
    partnerVisitActive?: boolean;
    partnerWaitRemainingMs?: number;
    reward?: FaucetReward;
}

const FAUCET_MND_SCRIPT = 'https://ss.mrmnd.com/banner.js';
const FAUCET_MND_BANNER_ID = '5674e300-8e33-44ee-ba4c-1f67f2934df2';
const FAUCET_ZERADS_FALLBACK = 'https://zerads.com/ad/ad.php?width=300&ref=10776';

/** Survives React Strict Mode remounts (refs reset per instance). */
let faucetStatusBootstrapped = false;
/** Survives remounts while partner countdown is driven locally (not from API). */
let faucetLocalPartnerFlowLock = false;

const FAUCET_PARTNER_SESSION_KEY = 'bm_faucet_partner_session_v1';

function isPartnerUnlockedInSession(): boolean {
    try {
        return sessionStorage.getItem(FAUCET_PARTNER_SESSION_KEY) === '1';
    } catch {
        return false;
    }
}

function markPartnerUnlockedInSession() {
    try {
        sessionStorage.setItem(FAUCET_PARTNER_SESSION_KEY, '1');
    } catch {
        /* private mode */
    }
}

function clearPartnerSession() {
    faucetLocalPartnerFlowLock = false;
    try {
        sessionStorage.removeItem(FAUCET_PARTNER_SESSION_KEY);
    } catch {
        /* private mode */
    }
}

/** @internal Vitest only */
export function __resetFaucetStatusBootstrapForTests() {
    faucetStatusBootstrapped = false;
    faucetLocalPartnerFlowLock = false;
    clearPartnerSession();
}

declare global {
    interface Window {
        __bmMndScriptLoaded?: boolean;
    }
}

function ensureMondiadScript(): Promise<void> {
    if (window.__bmMndScriptLoaded) return Promise.resolve();
    const existing = document.querySelector(`script[src="${FAUCET_MND_SCRIPT}"]`);
    if (existing) {
        return new Promise((resolve, reject) => {
            if (window.__bmMndScriptLoaded) {
                resolve();
                return;
            }
            existing.addEventListener('load', () => {
                window.__bmMndScriptLoaded = true;
                resolve();
            }, { once: true });
            existing.addEventListener('error', () => reject(new Error('mnd_script_failed')), { once: true });
        });
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.src = FAUCET_MND_SCRIPT;
        script.onload = () => {
            window.__bmMndScriptLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error('mnd_script_failed'));
        document.head.appendChild(script);
    });
}

export default function Faucet() {
    const { t } = useTranslation();
    const [status, setStatus] = useState<FaucetStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [remainingMs, setRemainingMs] = useState(0);
    const [partnerWaitMs, setPartnerWaitMs] = useState(0);
    const [canClaim, setCanClaim] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [isPartnerUnlocked, setIsPartnerUnlocked] = useState(false);
    const [isAdClicked, setIsAdClicked] = useState(false);
    /** True after /partner/start returned waitMs — avoids one-frame iframe flash when countdown hits 0 */
    const [partnerFlowActive, setPartnerFlowActive] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const partnerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const remainingMsRef = useRef(0);
    const partnerFlowActiveRef = useRef(false);
    const partnerWaitMsRef = useRef(0);
    const isAdClickedRef = useRef(false);
    const statusFetchSeqRef = useRef(0);

    const applyPartnerStateFromStatus = useCallback((data: FaucetStatus) => {
        const remaining = data.remainingMs || 0;
        if (remaining > 0) {
            clearPartnerSession();
            setIsPartnerUnlocked(false);
            setCanClaim(false);
            setIsAdClicked(false);
            setPartnerFlowActive(false);
            setPartnerWaitMs(0);
            return;
        }
        const waitMs = Math.max(0, Number(data.partnerWaitRemainingMs || 0));
        const visitActive = Boolean(data.partnerVisitActive);
        const ready = Boolean(data.partnerReady);
        if (visitActive && waitMs > 0) {
            setPartnerFlowActive(true);
            setPartnerWaitMs(waitMs);
            setIsAdClicked(true);
            setIsPartnerUnlocked(false);
            setCanClaim(false);
            return;
        }
        if (ready) {
            if (!isPartnerUnlockedInSession()) {
                setIsPartnerUnlocked(false);
                setCanClaim(false);
                setIsAdClicked(false);
                setPartnerFlowActive(false);
                setPartnerWaitMs(0);
                return;
            }
            setPartnerFlowActive(true);
            setPartnerWaitMs(0);
            setIsAdClicked(true);
            setIsPartnerUnlocked(true);
            setCanClaim(Boolean(data.canClaim));
            return;
        }
        setIsPartnerUnlocked(false);
        setCanClaim(false);
        setIsAdClicked(false);
        setPartnerFlowActive(false);
        setPartnerWaitMs(0);
    }, []);

    const fetchStatus = useCallback(async () => {
        const fetchId = ++statusFetchSeqRef.current;
        try {
            const res = await api.get<FaucetStatus>('/faucet/status');
            if (fetchId !== statusFetchSeqRef.current) {
                return;
            }
            if (res.data.ok) {
                setStatus(res.data);
                setRemainingMs(res.data.remainingMs || 0);
                const onCooldown = (res.data.remainingMs || 0) > 0;
                const inLocalPartnerFlow =
                    faucetLocalPartnerFlowLock ||
                    partnerFlowActiveRef.current ||
                    partnerWaitMsRef.current > 0 ||
                    isAdClickedRef.current;
                if (!inLocalPartnerFlow || onCooldown) {
                    applyPartnerStateFromStatus(res.data);
                }
            }
        } catch (err: unknown) {
            console.error("Faucet status fetch failed", err);
        } finally {
            if (fetchId === statusFetchSeqRef.current) {
                setIsLoading(false);
            }
        }
    }, [applyPartnerStateFromStatus]);

    useEffect(() => {
        if (faucetStatusBootstrapped) return;
        faucetStatusBootstrapped = true;
        void fetchStatus();
    }, [fetchStatus]);

    const bannerShouldShow = !isLoading && remainingMs === 0 && !isPartnerUnlocked && !partnerFlowActive && partnerWaitMs === 0;

    useEffect(() => {
        if (!bannerShouldShow) return;
        void ensureMondiadScript().catch(() => {});
    }, [bannerShouldShow]);

    useEffect(() => {
        remainingMsRef.current = remainingMs;
    }, [remainingMs]);

    useEffect(() => {
        partnerFlowActiveRef.current = partnerFlowActive;
    }, [partnerFlowActive]);

    useEffect(() => {
        partnerWaitMsRef.current = partnerWaitMs;
    }, [partnerWaitMs]);

    useEffect(() => {
        isAdClickedRef.current = isAdClicked;
    }, [isAdClicked]);

    useEffect(() => {
        if (remainingMs > 0) {
            timerRef.current = setInterval(() => {
                setRemainingMs((prev) => Math.max(0, prev - 1000));
            }, 1000);
        } else if (timerRef.current != null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        return () => {
            if (timerRef.current != null) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [remainingMs]);

    const partnerCountdownActive = partnerWaitMs > 0;
    useEffect(() => {
        if (!partnerCountdownActive) return undefined;
        partnerTimerRef.current = setInterval(() => {
            setPartnerWaitMs((prev) => {
                if (prev <= 1000) return 0;
                return prev - 1000;
            });
        }, 1000);
        return () => {
            if (partnerTimerRef.current != null) {
                clearInterval(partnerTimerRef.current);
                partnerTimerRef.current = null;
            }
        };
    }, [partnerCountdownActive]);

    useEffect(() => {
        if (partnerWaitMs !== 0 || !partnerFlowActive) return;
        markPartnerUnlockedInSession();
        setIsPartnerUnlocked(true);
        setCanClaim(remainingMsRef.current <= 0);
    }, [partnerWaitMs, partnerFlowActive]);

    // Monetag itself handles the click and opens its own ad in a new tab.
    // We only call the backend to start the 10s timer and unlock the claim — we do NOT redirect anywhere.
    const startPartnerTimer = async () => {
        try {
            const res = await api.post('/faucet/partner/start');
            if (res.data.ok) {
                const waitMs = res.data.waitMs || 10000;
                partnerFlowActiveRef.current = true;
                partnerWaitMsRef.current = waitMs;
                setPartnerFlowActive(true);
                setPartnerWaitMs(waitMs);
                toast.info(t('faucet.partner_toast_started'));
            }
        } catch (err) {
            faucetLocalPartnerFlowLock = false;
            isAdClickedRef.current = false;
            setIsAdClicked(false);
            toast.error(t('common.error'));
        }
    };

    const handlePartnerVisit = () => {
        if (isAdClicked || remainingMs > 0 || isPartnerUnlocked) {
            return;
        }
        statusFetchSeqRef.current += 1;
        faucetLocalPartnerFlowLock = true;
        isAdClickedRef.current = true;
        setIsAdClicked(true);
        window.open(FAUCET_ZERADS_FALLBACK, '_blank', 'noopener,noreferrer');
        void startPartnerTimer();
    };

    const handleClaim = async () => {
        if (!canClaim || isClaiming) return;

        try {
            setIsClaiming(true);
            const res = await api.post('/faucet/claim');
            if (res.data.ok) {
                toast.success(res.data.message || t('common.success'));
                clearPartnerSession();
                fetchStatus();
                setIsPartnerUnlocked(false);
                setCanClaim(false);
                setIsAdClicked(false);
                setPartnerFlowActive(false);
            }
        } catch (err: unknown) {
            const ax = err as AxiosError<{ message?: string }>;
            toast.error(ax.response?.data?.message || t('common.error'));
        } finally {
            setIsClaiming(false);
        }
    };

    const formatTime = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    if (isLoading) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t('faucet.loading')}</p>
        </div>
    );

    const reward = status?.reward;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="text-center space-y-4">
                <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-2">
                    <Gift className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight uppercase italic">Hardware Faucet</h1>
                <p className="text-gray-500 font-medium max-w-lg mx-auto">
                    {t('faucet.subtitle')}
                </p>
            </div>

            <PowerBoostBanner />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-8">{t('faucet.avail_prize')}</h3>
                        
                        <div className="flex flex-col items-center text-center space-y-8">
                            <div className="w-48 h-48 bg-gray-900/50 rounded-3xl p-8 border border-gray-800 group-hover:border-primary/30 transition-all duration-500 group-hover:scale-105 shadow-inner flex items-center justify-center">
                                <Zap className="w-24 h-24 text-primary animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tighter">{reward?.name || 'Pulse Mini v1'}</h2>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="flex items-center justify-center gap-2 text-primary font-black">
                                        <Zap className="w-4 h-4" aria-hidden />
                                        <span className="text-lg">{reward?.hashRate || 1} {t('faucet.ghs')}</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs font-semibold tracking-wide">
                                        <Infinity className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
                                        <span>
                                            {reward?.inventoryPermanent === false
                                                ? t('faucet.reward_temporary')
                                                : t('faucet.reward_permanent')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-0"></div>
                </div>

                <div className="space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-[3rem] p-10 shadow-xl relative overflow-hidden">
                        {remainingMs > 0 ? (
                            <div className="text-center space-y-6">
                                <div className="flex justify-center">
                                    <div className="w-24 h-24 rounded-full border-4 border-gray-800 border-t-primary animate-spin flex items-center justify-center shadow-glow-sm">
                                        <Clock className="w-10 h-10 text-primary -rotate-45" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{t('faucet.wait_cooldown')}</p>
                                    <h3 className="text-4xl font-black text-white italic">{formatTime(remainingMs)}</h3>
                                </div>
                                <div className="p-5 bg-gray-900/50 rounded-2xl border border-gray-800 flex items-start gap-4 text-left shadow-inner">
                                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-gray-500 font-medium leading-relaxed">
                                        {t('faucet.cooldown_msg')}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className={`p-8 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden ${
                                    isPartnerUnlocked ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-primary/5 border-primary/20 shadow-inner'
                                }`}>
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            {isPartnerUnlocked ? <Unlock className="w-5 h-5 text-emerald-500" /> : <Lock className="w-5 h-5 text-primary" />}
                                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{t('faucet.step_partner')}</span>
                                        </div>
                                        {isPartnerUnlocked && <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-in zoom-in duration-300" />}
                                    </div>
                                    
                                    <p className="text-xs text-gray-500 font-medium mb-8 leading-relaxed">{t('faucet.partner_msg')}</p>

                                    {partnerWaitMs > 0 ? (
                                        <div className="flex items-center justify-center gap-4 py-6 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl">
                                            <Timer className="w-6 h-6 text-primary animate-pulse" />
                                            <span className="text-lg font-black text-white italic uppercase tracking-tighter">
                                                {t('faucet.wait_seconds', { seconds: Math.ceil(partnerWaitMs / 1000) })}
                                            </span>
                                        </div>
                                    ) : isPartnerUnlocked || (partnerFlowActive && partnerWaitMs === 0) ? (
                                        <div className="flex items-center justify-center gap-4 py-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                            <span className="text-lg font-black text-emerald-500 uppercase italic tracking-tighter">{t('faucet.unlocked')}</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/*
                                              ZerAds iframe is visual only (pointer-events-none). The button receives
                                              every click — iframe isolation was blocking partner/start (H4 confirmed).
                                              Monetag slot loads opportunistically behind the preview when banner.js fills.
                                            */}
                                            <div className="w-full max-w-[300px] mx-auto space-y-3">
                                                <div className="relative rounded-2xl overflow-hidden border border-gray-700 bg-gray-900 min-h-[250px]">
                                                    <div
                                                        data-mndbanid={FAUCET_MND_BANNER_ID}
                                                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                                    />
                                                    <iframe
                                                        src={FAUCET_ZERADS_FALLBACK}
                                                        width={300}
                                                        height={250}
                                                        marginWidth={0}
                                                        marginHeight={0}
                                                        scrolling="no"
                                                        frameBorder={0}
                                                        style={{ border: 'none', maxWidth: '100%', width: '100%', display: 'block', pointerEvents: 'none' }}
                                                        title={t('faucet.partner_iframe_title')}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handlePartnerVisit}
                                                    disabled={isAdClicked}
                                                    className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                    {t('faucet.partner_open_btn')}
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-center gap-2 text-primary/60">
                                                <MousePointer2 className="w-3 h-3" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">{t('faucet.partner_click_hint')}</span>
                                            </div>
                                            <div className="flex items-center justify-center gap-2 text-primary/40">
                                                <ExternalLink className="w-3 h-3" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">{t('faucet.partner_new_tab_hint')}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button onClick={handleClaim} disabled={!canClaim || isClaiming} className={`w-full py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-4 italic ${
                                        canClaim ? 'bg-primary text-white shadow-primary/20 hover:scale-[1.02] hover:shadow-primary/40' : 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700/50'
                                    }`}>
                                    {isClaiming ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            <Gift className={`w-6 h-6 ${canClaim ? 'animate-bounce' : ''}`} />
                                            {t('faucet.claim_miner')}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-[2rem] p-8 flex gap-5 shadow-xl">
                        <div className="p-3 bg-blue-500/10 rounded-xl h-fit">
                            <Info className="w-6 h-6 text-blue-400 shrink-0" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-white text-xs font-black uppercase tracking-widest italic">{t('shop.how_it_works_title')}</h4>
                            <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{t('faucet.how_it_works_msg')}</p>
                            <p className="text-[11px] text-sky-300/90 font-medium leading-relaxed border-t border-blue-500/15 pt-3 mt-1">
                                {t('faucet.permanent_equipment_note')}
                            </p>
                        </div>
                    </div>

                    <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="faucet-bottom" />
                </div>
            </div>
        </div>
    );
}
