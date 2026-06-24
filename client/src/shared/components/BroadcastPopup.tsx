import { useEffect, useState } from 'react';
import { X, ExternalLink, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../store/auth';

type BroadcastMessage = {
  id: number | string;
  title?: string;
  content?: string;
  imageUrl?: string;
  dismissDelaySeconds?: number;
  linkUrl?: string | null;
  linkLabel?: string | null;
  linkNewTab?: boolean;
};

function isBroadcastMessage(v: unknown): v is BroadcastMessage {
  if (typeof v !== 'object' || v === null) return false;
  if (!('id' in v)) return false;
  const id = (v as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number';
}

function clampDelay(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 10;
  return Math.min(120, n);
}

export default function BroadcastPopup() {
    const navigate = useNavigate();
    const [message, setMessage] = useState<BroadcastMessage | null>(null);
    const [visible, setVisible] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(10);

    useEffect(() => {
        api.get('/broadcast/active')
            .then(res => {
                const raw = res.data?.message;
                if (res.data.ok && isBroadcastMessage(raw)) {
                    setMessage(raw);
                    setSecondsLeft(clampDelay(raw.dismissDelaySeconds ?? 10));
                    setVisible(true);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!visible || secondsLeft <= 0) return undefined;
        const t = window.setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
        return () => window.clearTimeout(t);
    }, [visible, secondsLeft]);

    const dismiss = () => {
        setVisible(false);
        if (message) {
            api.post(`/broadcast/${message.id}/dismiss`).catch(() => {});
        }
    };

    const followLink = () => {
        if (!message?.linkUrl) return;
        const url = message.linkUrl.trim();
        const isExternal = /^https?:\/\//i.test(url);
        // Mark as seen, hide popup, then navigate.
        if (message) api.post(`/broadcast/${message.id}/dismiss`).catch(() => {});
        setVisible(false);
        if (isExternal) {
            if (message.linkNewTab) {
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = url;
            }
        } else {
            // Internal route → react-router
            if (message.linkNewTab) {
                window.open(url, '_blank', 'noopener');
            } else {
                navigate(url);
            }
        }
    };

    if (!visible || !message) return null;

    const buttonLocked = secondsLeft > 0;
    const hasLink = !!message.linkUrl;
    const linkIsExternal = hasLink && /^https?:\/\//i.test(message.linkUrl!);
    const primaryLabel = message.linkLabel?.trim() || (hasLink ? 'Ir agora' : 'OK, entendi');

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/75 backdrop-blur-md"
                onClick={dismiss}
            />

            {/* Card — bumped from max-w-md (448px) to max-w-2xl (672px) */}
            <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-300">
                <button
                    onClick={dismiss}
                    aria-label="Fechar"
                    className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white transition-all backdrop-blur-sm"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Image — taller now */}
                {message.imageUrl && (
                    <div className="w-full">
                        <img
                            src={message.imageUrl}
                            alt={message.title}
                            className="w-full max-h-96 object-cover"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                    </div>
                )}

                {/* Content — bigger padding + typography */}
                <div className="p-8 sm:p-10">
                    <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-3 tracking-tight pr-12">
                        {message.title}
                    </h2>
                    {message.content && (
                        <p className="text-slate-300 text-base leading-relaxed whitespace-pre-line">
                            {message.content}
                        </p>
                    )}

                    {/* Buttons */}
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                        {hasLink ? (
                            <>
                                <button
                                    onClick={followLink}
                                    disabled={buttonLocked}
                                    aria-busy={buttonLocked}
                                    className={`flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-6 font-black text-sm rounded-xl transition-all uppercase tracking-widest ${
                                        buttonLocked
                                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                            : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30'
                                    }`}
                                >
                                    {buttonLocked
                                        ? `Aguarde ${secondsLeft}s…`
                                        : <>{primaryLabel}{linkIsExternal ? <ExternalLink className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}</>}
                                </button>
                                <button
                                    onClick={dismiss}
                                    className="inline-flex items-center justify-center py-3.5 px-6 font-bold text-sm rounded-xl uppercase tracking-widest text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all"
                                >
                                    Fechar
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={dismiss}
                                disabled={buttonLocked}
                                aria-busy={buttonLocked}
                                className={`w-full py-3.5 font-black text-sm rounded-xl transition-all uppercase tracking-widest ${
                                    buttonLocked
                                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                        : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30'
                                }`}
                            >
                                {buttonLocked ? `Aguarde ${secondsLeft}s…` : primaryLabel}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
