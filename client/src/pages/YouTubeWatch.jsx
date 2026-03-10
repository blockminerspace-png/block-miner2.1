import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Youtube, Play, Pause, Zap, Clock, TrendingUp, AlertCircle, CheckCircle2, History, BarChart3, ShieldCheck } from 'lucide-react';
import { api } from '../store/auth';
import { formatHashrate } from '../utils/machine';
import { validateTrustedEvent, generateSecurityPayload } from '../utils/security';

export default function YouTubeWatch() {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [videoId, setVideoId] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const [status, setStatus] = useState(null);
    const [stats, setStats] = useState(null);

    const timerRef = useRef(null);

    const extractVideoId = (input) => {
        const raw = String(input || "").trim();
        const idPattern = /^[a-zA-Z0-9_-]{11}$/;
        if (idPattern.test(raw)) return raw;
        try {
            const urlObj = new URL(raw);
            const host = urlObj.hostname.replace(/^www\./, "").toLowerCase();
            if (host === "youtu.be") return urlObj.pathname.split("/")[1];
            if (host === "youtube.com" || host === "m.youtube.com") {
                if (urlObj.pathname === "/watch") return urlObj.searchParams.get("v");
                if (urlObj.pathname.startsWith("/embed/")) return urlObj.pathname.split("/")[2];
            }
        } catch { return null; }
        return null;
    };

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/youtube/status');
            if (res.data.ok) {
                setStatus(res.data);
            }
        } catch (err) { console.error(err); }
    }, []);

    const fetchUserStats = useCallback(async () => {
        try {
            const res = await api.get('/youtube/stats');
            if (res.data.ok) setStats(res.data);
        } catch (err) { console.error(err); }
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchUserStats();
    }, [fetchStatus, fetchUserStats]);

    const handleLoadVideo = (e) => {
        if (!validateTrustedEvent(e)) return;
        const id = extractVideoId(url);
        if (id) {
            setVideoId(id);
            toast.success('Vídeo carregado com sucesso!');
        } else {
            toast.error('URL do YouTube inválida.');
        }
    };

    const claimReward = async () => {
        try {
            const res = await api.post('/youtube/claim', { videoId });
            if (res.data.ok) {
                toast.success(`+${res.data.rewardGh.toFixed(2)} GH/s aplicado!`);
                setCountdown(60);
                fetchStatus();
                fetchUserStats();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha no resgate.');
            setIsRunning(false);
        }
    };

    // Heartbeat to sync time with server (anti-cheat + focus check)
    useEffect(() => {
        let heartbeatInterval;
        if (isRunning && !document.hidden) {
            heartbeatInterval = setInterval(async () => {
                try {
                    const security = generateSecurityPayload();
                    await api.post('/session/heartbeat', { 
                        type: 'youtube',
                        security
                    });
                } catch (err) {
                    console.error("Heartbeat sync failed");
                }
            }, 10000); // sync every 10s
        }
        return () => clearInterval(heartbeatInterval);
    }, [isRunning]);

    useEffect(() => {
        if (isRunning && !document.hidden) {
            timerRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        claimReward();
                        return 60;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isRunning, videoId]);

    const handleToggleRunning = (e) => {
        if (!validateTrustedEvent(e)) return;
        setIsRunning(!isRunning);
    };

    const dailyProgress = stats ? (stats.hashGranted24h / stats.dailyLimit) * 100 : 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
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
                    <span className="text-primary font-black text-[10px] uppercase tracking-widest">Protocolo de Prova de Visualização Ativo</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Video Area */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-bl-[120px] -mr-20 -mt-20 group-hover:bg-red-500/10 transition-colors" />
                        
                        <div className="flex gap-4 mb-8 relative z-10">
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Cole a URL do vídeo do YouTube aqui..."
                                className="flex-1 bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                            />
                            <button
                                onClick={handleLoadVideo}
                                className="px-8 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all italic shadow-lg shadow-primary/20"
                            >
                                Carregar
                            </button>
                        </div>

                        <div className="aspect-video bg-gray-900 rounded-[2rem] overflow-hidden border border-gray-800 relative group shadow-inner">
                            {videoId ? (
                                <iframe
                                    className="w-full h-full"
                                    src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                                    title="YouTube video player"
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                ></iframe>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                                    <Youtube className="w-20 h-20 mb-4 opacity-20" />
                                    <p className="font-bold uppercase tracking-widest text-[10px]">Aguardando vídeo do YouTube...</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleToggleRunning}
                                    disabled={!videoId}
                                    className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl italic ${isRunning
                                            ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-30'
                                        }`}
                                >
                                    {isRunning ? <><Pause className="w-4 h-4 fill-current" /> Pausar Ganho</> : <><Play className="w-4 h-4 fill-current" /> Iniciar Ganho</>}
                                </button>
                                {isRunning && (
                                    <div className="flex items-center gap-3 px-6 py-4 bg-gray-800/50 rounded-2xl border border-gray-700/50 shadow-inner">
                                        <Clock className="w-4 h-4 text-primary animate-pulse" />
                                        <span className="text-sm font-bold text-white uppercase italic tracking-tighter">Próximo Ganho em {countdown}s</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Reward Tracker Sidebar */}
                <div className="space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -mr-10 -mt-10" />
                        
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-primary" /> Reward Tracker
                        </h3>
                        
                        <div className="space-y-6 relative z-10">
                            <TrackerItem label="Next claim in" value={isRunning ? `${countdown}s` : '--'} icon={Clock} color="primary" />
                            <TrackerItem label="Claim per minute" value={`${Number(status?.rewardGh || 3).toFixed(2)} GH/s`} icon={Zap} color="amber" />
                            <TrackerItem label="Duration per claim" value={`${Number(status?.durationMin || 1440)} min`} icon={History} color="blue" />
                            <div className="h-[1px] bg-gray-800 w-full my-2" />
                            <TrackerItem label="Active YouTube bonus" value={formatHashrate((status?.activeHashRate || 0) * 1000000000)} icon={TrendingUp} color="emerald" />
                        </div>
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">Claims (24h)</span>
                                <span className="text-white">{stats?.claims24h || 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">Hash granted (24h)</span>
                                <span className="text-emerald-400">{Number(stats?.hashGranted24h || 0).toFixed(2)} GH/s</span>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-bold text-gray-600 uppercase">Daily Limit Progress</span>
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
                                <span className="text-slate-500">Claims (all time)</span>
                                <span className="text-white">{stats?.claimsTotal || 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className="text-slate-500">Hash granted (all time)</span>
                                <span className="text-primary">{Number(stats?.hashGrantedTotal || 0).toFixed(2)} GH/s</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TrackerItem({ label, value, icon: Icon, color }) {
    const colorMap = {
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
