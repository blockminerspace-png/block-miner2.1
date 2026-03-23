import { useEffect, useState } from 'react';

export default function AdBanner({ size = '728x90', forceProvider = null }) {
    const [isBlank, setIsBlank] = useState(false);
    const [provider, setProvider] = useState('zerads'); // 'zerads' or 'silvio'

    const config = {
        '728x90': { width: 728, height: 90, id: 10776 },
        '468x60': { width: 468, height: 60, id: 10776 },
        '300x250': { width: 300, height: 250, id: 10776 }
    };

    const { width, height, id } = config[size] || config['728x90'];

    useEffect(() => {
        if (forceProvider) {
            setProvider(forceProvider);
            return;
        }

        // 30% Silvio, 70% ZerAds
        const isSilvio = Math.random() < 0.3;
        
        if (isSilvio) {
            setProvider('silvio');
            return;
        }

        setProvider('zerads');
        setIsBlank(false);
    }, [size, forceProvider]);

    if (provider === 'silvio') {
        return (
            <div className="flex flex-col items-center justify-center gap-2 my-12 animate-in fade-in duration-1000 w-full overflow-hidden">
                <div 
                    className="relative bg-slate-900/40 border border-white/10 rounded-xl overflow-hidden shadow-2xl"
                    style={{ width: width, height: height, maxWidth: '100%' }}
                >
                    <a href="https://www.youtube.com/watch?v=QaRzOr7HPDs" target="_blank" rel="noopener noreferrer" className="block w-full h-full group">
                        <img 
                            src="/Silvio/Banner (2).jpg" 
                            alt="Advertisement" 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                </div>
                <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.4em] italic mt-2">
                    ⇑ Patrocinado ⇑
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center gap-2 my-12 animate-in fade-in duration-1000 w-full overflow-hidden">
            <div 
                className="relative bg-slate-900/40 border border-white/10 rounded-xl overflow-hidden shadow-2xl"
                style={{ width: width, height: height, maxWidth: '100%' }}
            >
                {isBlank ? (
                    <a href={`https://zerads.com/index.php?view=site&id=${id}`} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                        <div className="w-full h-full bg-slate-800/20 flex items-center justify-center relative group">
                            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span style={{ 
                                fontSize: size === '728x90' ? '40px' : '24px',
                                fontFamily: 'Arial, sans-serif'
                            }} className="font-black text-slate-700 italic uppercase tracking-tighter select-none">
                                Advertise Here
                            </span>
                        </div>
                    </a>
                ) : (
                    <iframe 
                        style={{ border: 'none', width: '100%', height: '100%' }} 
                        width={width} 
                        height={height} 
                        // Use the proxy route instead of fetching HTML directly to avoid CSP blocks
                        src={`/api/zerads/render?id=${id}&width=${width}`}
                        title={`ZerAds ${size}`}
                    />
                )}
            </div>
            <a 
                href={`https://zerads.com/index.php?view=site&id=${id}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[8px] font-black text-slate-600 hover:text-primary transition-colors uppercase tracking-[0.4em] italic mt-2"
            >
                ⇑ Your Ad Here ⇑
            </a>
        </div>
    );
}
