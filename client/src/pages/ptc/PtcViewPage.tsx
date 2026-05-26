import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, Timer, CheckCircle2, Gift, Loader2, ExternalLink, Info, Megaphone } from 'lucide-react';
import { api } from '../../store/auth';

interface PtcAd {
    id: number;
    title: string;
    description: string;
    url: string;
    adType: 'iframe' | 'window';
    durationSeconds: number;
    rewardPerViewShib: string;
}

interface PtcSettings {
    rewardPerViewShib: string;
    isEnabled: boolean;
}

export default function PtcViewPage() {
    const [ad, setAd] = useState<PtcAd | null>(null);
    const [settings, setSettings] = useState<PtcSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewing, setViewing] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [claimed, setClaimed] = useState(false);
    const [adOpened, setAdOpened] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchNext = useCallback(async () => {
        setLoading(true);
        setClaimed(false);
        setViewing(false);
        setAdOpened(false);
        setCountdown(0);
        try {
            const [adRes, settingsRes] = await Promise.all([
                api.get('/ptc/next'),
                api.get('/ptc/settings'),
            ]);
            setAd(adRes.data.ad);
            setSettings(settingsRes.data.settings);
        } catch {
            toast.error('Erro ao carregar anúncio');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNext();
    }, [fetchNext]);

    function startViewing() {
        if (!ad) return;
        if (ad.adType === 'window') {
            window.open(ad.url, '_blank', 'noopener,noreferrer');
        }
        setAdOpened(true);
        setViewing(true);
        setCountdown(ad.durationSeconds);
        timerRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current!);
                    timerRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    useEffect(() => {
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    async function handleClaim() {
        if (!ad || countdown > 0) return;
        try {
            const res = await api.post(`/ptc/view/${ad.id}`);
            if (res.data.ok) {
                setClaimed(true);
                toast.success(`+${Number(ad.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 4 })} SHIB creditado!`);
                setTimeout(fetchNext, 2000);
            } else {
                toast.error(res.data.message ?? 'Erro');
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro ao registrar visualização');
        }
    }

    if (loading) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!settings?.isEnabled) return (
        <div className="max-w-2xl mx-auto text-center py-20">
            <p className="text-gray-500 font-black uppercase tracking-widest text-sm">Sistema PTC temporariamente desabilitado</p>
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 text-center space-y-3">
                    <div className="inline-flex p-3 bg-orange-500/10 rounded-2xl mb-2">
                        <img src="/shib.svg" alt="SHIB" className="w-8 h-8 rounded-full" />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight uppercase italic">PTC — Ganhe SHIB</h1>
                    <p className="text-gray-500 font-medium max-w-lg mx-auto text-sm">
                        Visualize anúncios e ganhe <span className="text-orange-400 font-black">SHIBA INU</span> por cada visualização completa.
                    </p>
                    {settings && (
                        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-2">
                            <img src="/shib.svg" alt="" className="w-4 h-4 rounded-full" />
                            <span className="text-orange-300 font-black text-xs uppercase tracking-widest">
                                {Number(settings.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 4 })} SHIB por visualização
                            </span>
                        </div>
                    )}
                </div>
                <Link
                    to="/ptc/campaigns"
                    className="flex items-center gap-2 px-5 py-3 bg-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-orange-400 transition-all hover:scale-[1.02] shadow-lg shadow-orange-500/20 shrink-0"
                >
                    <Megaphone className="w-4 h-4" />
                    Minhas Campanhas
                </Link>
            </div>

            {!ad ? (
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-16 text-center space-y-4">
                    <Eye className="w-16 h-16 text-gray-700 mx-auto" />
                    <h3 className="text-white font-black uppercase tracking-widest text-sm">Nenhum anúncio disponível</h3>
                    <p className="text-gray-600 text-xs font-medium">Volte mais tarde para encontrar novos anúncios.</p>
                    <button onClick={fetchNext} className="mt-4 px-6 py-3 bg-gray-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-700 transition-colors">
                        Verificar novamente
                    </button>
                    <Link
                        to="/ptc/campaigns"
                        className="mt-2 inline-flex items-center gap-2 px-6 py-3 bg-orange-500/10 border border-orange-500/20 text-orange-300 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-orange-500/20 transition-colors"
                    >
                        <Megaphone className="w-4 h-4" />
                        Anunciar aqui
                    </Link>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Ad Card */}
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 space-y-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1 flex-1">
                                <h2 className="text-white font-black text-xl uppercase italic tracking-tight">{ad.title}</h2>
                                {ad.description && (
                                    <p className="text-gray-500 text-sm font-medium">{ad.description}</p>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-1.5">
                                    <img src="/shib.svg" alt="" className="w-4 h-4 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                                    <span className="text-orange-300 font-black text-xs">
                                        +{Number(ad.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 4 })} SHIB
                                    </span>
                                </div>
                                <span className="text-gray-600 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                                    <Timer className="w-3 h-3" /> {ad.durationSeconds}s
                                </span>
                            </div>
                        </div>

                        {/* Ad frame (iframe type) */}
                        {ad.adType === 'iframe' && adOpened && (
                            <div className="rounded-2xl overflow-hidden border border-gray-700 bg-gray-900">
                                <iframe
                                    src={ad.url}
                                    title={ad.title}
                                    className="w-full"
                                    style={{ height: 250, border: 0 }}
                                    sandbox="allow-scripts allow-same-origin allow-popups"
                                />
                            </div>
                        )}

                        {/* Countdown / Claim */}
                        {!viewing && !claimed && (
                            <button
                                onClick={startViewing}
                                className="w-full py-5 bg-orange-500 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-orange-400 transition-all hover:scale-[1.02] flex items-center justify-center gap-3 text-sm italic shadow-lg shadow-orange-500/20"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {ad.adType === 'window' ? 'Abrir anúncio em nova aba' : 'Ver anúncio'}
                            </button>
                        )}

                        {viewing && countdown > 0 && (
                            <div className="flex items-center justify-center gap-4 py-6 bg-gray-900 rounded-2xl border border-gray-800">
                                <Timer className="w-6 h-6 text-orange-400 animate-pulse" />
                                <span className="text-2xl font-black text-white italic uppercase tracking-tighter">
                                    Aguarde {countdown}s
                                </span>
                            </div>
                        )}

                        {viewing && countdown === 0 && !claimed && (
                            <button
                                onClick={handleClaim}
                                className="w-full py-5 bg-emerald-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-500 transition-all hover:scale-[1.02] flex items-center justify-center gap-3 text-sm italic shadow-lg shadow-emerald-600/20 animate-bounce"
                            >
                                <Gift className="w-5 h-5" />
                                Resgatar recompensa SHIB!
                            </button>
                        )}

                        {claimed && (
                            <div className="flex items-center justify-center gap-3 py-5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                <span className="text-emerald-400 font-black uppercase italic tracking-tighter text-lg">SHIB Creditado!</span>
                                <Loader2 className="w-4 h-4 text-gray-600 animate-spin ml-2" />
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5 flex gap-4">
                        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                            O valor é pago em <strong className="text-orange-300">SHIBA INU (SHIB)</strong>. O saldo é creditado imediatamente após confirmar a visualização. Saques disponíveis na aba SHIB da sua carteira.
                        </p>
                    </div>

                </div>
            )}
        </div>
    );
}
