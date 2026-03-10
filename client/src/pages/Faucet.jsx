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
    Loader2
} from 'lucide-react';
import { api } from '../store/auth';

export default function Faucet() {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [remainingMs, setRemainingMs] = useState(0);
    const [partnerWaitMs, setPartnerWaitMs] = useState(0);
    const [canClaim, setCanClaim] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [isPartnerUnlocked, setIsPartnerUnlocked] = useState(false);
    const [isAdClicked, setIsAdClicked] = useState(false);
    
    const timerRef = useRef(null);
    const partnerTimerRef = useRef(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/faucet/status');
            if (res.data.ok) {
                setStatus(res.data);
                setRemainingMs(res.data.remainingMs || 0);
                if (res.data.remainingMs > 0) {
                    setIsPartnerUnlocked(false);
                    setCanClaim(false);
                    setIsAdClicked(false);
                }
            }
        } catch (err) {
            console.error("Erro ao buscar status do faucet", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    useEffect(() => {
        if (remainingMs > 0) {
            timerRef.current = setInterval(() => {
                setRemainingMs(prev => Math.max(0, prev - 1000));
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [remainingMs]);

    useEffect(() => {
        if (partnerWaitMs > 0) {
            partnerTimerRef.current = setInterval(() => {
                setPartnerWaitMs(prev => {
                    if (prev <= 1000) {
                        setIsPartnerUnlocked(true);
                        setCanClaim(remainingMs <= 0);
                        return 0;
                    }
                    return prev - 1000;
                });
            }, 1000);
        } else {
            clearInterval(partnerTimerRef.current);
        }
        return () => clearInterval(partnerTimerRef.current);
    }, [partnerWaitMs, remainingMs]);

    // Detection of Ad Click via Window Blur
    useEffect(() => {
        const handleBlur = () => {
            // Check if the click happened on an iframe
            if (document.activeElement instanceof HTMLIFrameElement || document.activeElement?.tagName === 'IFRAME') {
                if (!isAdClicked && remainingMs <= 0 && !isPartnerUnlocked) {
                    startPartnerTimer();
                }
            }
        };

        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [isAdClicked, remainingMs, isPartnerUnlocked]);

    const startPartnerTimer = async () => {
        try {
            setIsAdClicked(true);
            const res = await api.post('/faucet/partner/start');
            if (res.data.ok) {
                setPartnerWaitMs(res.data.waitMs || 10000); // 10s wait
                toast.info("Patrocinador visitado! Mantenha a aba aberta.");
            }
        } catch (err) {
            setIsAdClicked(false);
        }
    };

    const handleClaim = async () => {
        if (!canClaim || isClaiming) return;

        try {
            setIsClaiming(true);
            const res = await api.post('/faucet/claim');
            if (res.data.ok) {
                toast.success(res.data.message || t('common.success'));
                fetchStatus();
                setIsPartnerUnlocked(false);
                setCanClaim(false);
                setIsAdClicked(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsClaiming(false);
        }
    };

    const formatTime = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    if (isLoading) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Carregando Faucet...</p>
        </div>
    );

    const reward = status?.reward;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="text-center space-y-4">
                <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-2">
                    <Gift className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight uppercase italic italic">Hardware Faucet</h1>
                <p className="text-gray-500 font-medium max-w-lg mx-auto">
                    {t('faucet.subtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-8">{t('faucet.avail_prize')}</h3>
                        
                        <div className="flex flex-col items-center text-center space-y-8">
                            <div className="w-48 h-48 bg-gray-900/50 rounded-3xl p-8 border border-gray-800 group-hover:border-primary/30 transition-all duration-500 group-hover:scale-105 shadow-inner">
                                <img src={reward?.imageUrl || '/assets/machines/reward1.png'} alt={reward?.name} className="w-full h-full object-contain" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tighter">{reward?.name || 'Pulse Mini v1'}</h2>
                                <div className="flex items-center justify-center gap-4 text-primary font-black">
                                    <div className="flex items-center gap-2">
                                        <Zap className="w-4 h-4" />
                                        <span className="text-lg">{reward?.hashRate || 1} {t('faucet.ghs')}</span>
                                    </div>
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-800" />
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-lg">1440m</span>
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
                                    ) : isPartnerUnlocked ? (
                                        <div className="flex items-center justify-center gap-4 py-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                            <span className="text-lg font-black text-emerald-500 uppercase italic tracking-tighter">{t('faucet.unlocked')}</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="w-full h-[100px] bg-gray-900/80 border border-gray-800 rounded-2xl flex items-center justify-center relative group/ad overflow-hidden">
                                                <div className="text-center space-y-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                                    <MousePointer2 className="w-6 h-6 mx-auto text-primary mb-1 group-hover:animate-bounce" />
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Espaço Publicitário</p>
                                                    <p className="text-[8px] font-bold text-gray-600 uppercase">Clique para desbloquear</p>
                                                </div>
                                                
                                                <iframe 
                                                    src="about:blank" 
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                                                    title="Ad Click Area"
                                                />
                                            </div>
                                            
                                            <div className="flex items-center justify-center gap-2 text-primary/50">
                                                <ExternalLink className="w-3 h-3" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">O link abrirá em uma nova aba</span>
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
