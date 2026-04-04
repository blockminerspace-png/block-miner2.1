import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, ExternalLink } from 'lucide-react';
import { api } from '../store/auth';

const AdBlockDetector = () => {
    const [isDetected, setIsDetected] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        const detectAdBlock = async () => {
            // Honeypot: cria elemento com classes típicas de anúncio
            // Adblocks ocultam (display:none) ou colapsam (height=0) esses elementos
            const honeypot = document.createElement('div');
            honeypot.className = 'ad-banner adsbox ads-google ad-placement public_ads';
            honeypot.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
            honeypot.innerHTML = '&nbsp;';
            document.body.appendChild(honeypot);

            await new Promise(r => setTimeout(r, 200));

            const style = window.getComputedStyle(honeypot);
            const isHidden =
                honeypot.offsetHeight === 0 &&
                honeypot.clientHeight === 0 &&
                style.display === 'none';

            document.body.removeChild(honeypot);

            if (isHidden) {
                setIsDetected(true);
                api.post('/auth/mark-adblock').catch(() => {});
            }
        };

        // Aguarda adblockers carregarem antes de testar
        const timer = setTimeout(detectAdBlock, 2500);
        return () => clearTimeout(timer);
    }, []);

    if (!isDetected || isDismissed) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-500">
            <div className="relative w-full max-w-lg bg-slate-900/50 border border-white/10 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden group">
                {/* Decorative Background */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 blur-[100px] rounded-full" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-orange-600/10 blur-[100px] rounded-full" />
                
                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center mb-8 shadow-inner animate-pulse">
                        <ShieldAlert className="w-12 h-12 text-red-500" />
                    </div>

                    <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-4 leading-tight">
                        Protocolo de <br />
                        <span className="text-primary">Sustento Ativado</span>
                    </h2>

                    <p className="text-slate-400 text-lg leading-relaxed mb-10 max-w-sm">
                        Detectamos que você está usando um <span className="text-white font-bold">Bloqueador de Anúncios</span>. 
                        Nossa infraestrutura de mineração depende da publicidade para continuar operando de forma gratuita.
                    </p>

                    <div className="grid grid-cols-1 gap-4 w-full">
                        <button 
                            onClick={() => window.location.reload()}
                            className="flex items-center justify-center gap-3 w-full py-5 bg-primary text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all uppercase italic tracking-widest shadow-glow"
                        >
                            Já desativei, recarregar <ExternalLink className="w-5 h-5" />
                        </button>
                        
                        <button 
                            onClick={() => setIsDismissed(true)}
                            className="w-full py-4 text-slate-500 font-bold hover:text-slate-300 transition-colors uppercase text-xs tracking-[0.3em]"
                        >
                            Continuar mesmo assim (Marcado)
                        </button>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5 w-full flex items-center justify-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        <span className="text-[10px] font-bold text-red-500/50 uppercase tracking-[0.2em]">User Marked: Security_Flag_ADBLOCK</span>
                    </div>
                </div>

                <button 
                    onClick={() => setIsDismissed(true)}
                    className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};

export default AdBlockDetector;
