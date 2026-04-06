import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../store/auth';

export default function BroadcastPopup() {
    const [message, setMessage] = useState(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        api.get('/broadcast/active')
            .then(res => {
                if (res.data.ok && res.data.message) {
                    setMessage(res.data.message);
                    setVisible(true);
                }
            })
            .catch(() => {});
    }, []);

    const dismiss = () => {
        setVisible(false);
        if (message) {
            api.post(`/broadcast/${message.id}/dismiss`).catch(() => {});
        }
    };

    if (!visible || !message) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={dismiss}
            />

            {/* Card */}
            <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Close button */}
                <button
                    onClick={dismiss}
                    className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Image */}
                {message.imageUrl && (
                    <div className="w-full">
                        <img
                            src={message.imageUrl}
                            alt={message.title}
                            className="w-full max-h-64 object-cover"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                    </div>
                )}

                {/* Content */}
                <div className="p-6">
                    <h2 className="text-lg font-black text-white leading-tight mb-2">
                        {message.title}
                    </h2>
                    {message.content && (
                        <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">
                            {message.content}
                        </p>
                    )}
                    <button
                        onClick={dismiss}
                        className="mt-5 w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-sm rounded-xl transition-all uppercase tracking-widest"
                    >
                        OK, entendi
                    </button>
                </div>
            </div>
        </div>
    );
}
