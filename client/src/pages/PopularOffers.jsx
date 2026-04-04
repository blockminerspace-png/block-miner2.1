import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Loader2, Zap, TrendingUp, CheckCircle2, AlertTriangle, X, Sparkles, Calendar, Clock, Minus, Plus, Package } from 'lucide-react';
import { api } from '../store/auth';
import { useGameStore } from '../store/game';
import { formatHashrate } from '../utils/machine';

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function PopularOffers() {
    const { t } = useTranslation();
    const { fetchAll } = useGameStore();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [buying, setBuying] = useState(false);
    const MAX_QTY = 25;

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/offer-events/active');
            if (res.data.ok) {
                setEvents(res.data.events || []);
            }
        } catch (e) {
            console.error(e);
            toast.error(t('common.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    const openModal = (ev, m) => { setQuantity(1); setModal({ event: ev, miner: m }); };

    const confirmBuy = async () => {
        if (!modal?.miner || buying) return;
        try {
            setBuying(true);
            const res = await api.post('/offer-events/purchase', { eventMinerId: modal.miner.id, quantity });
            if (res.data.ok) {
                toast.success(res.data.message || t('offers.purchase_ok'));
                fetchAll();
                setModal(null);
                load();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setBuying(false);
        }
    };

    if (loading) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t('common.loading')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-14 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {events.map((ev) => (
                <div key={ev.id} className="space-y-6">
                    {/* Cabeçalho do Evento */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800">
                        <div className="flex items-center gap-3">
                            {ev.isLive ? (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-[9px] font-black text-green-400 uppercase tracking-widest">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                    Ao Vivo
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-[9px] font-black text-amber-400 uppercase tracking-widest">
                                    <Clock className="w-3 h-3" />
                                    Em Breve
                                </span>
                            )}
                            <h2 className="text-xl font-black text-white uppercase italic tracking-tight">{ev.title}</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 text-xs text-gray-500">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-600" />
                                <span className="font-semibold">Início:</span>
                                <span>{fmtDate(ev.startsAt)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-600" />
                                <span className="font-semibold">Fim:</span>
                                <span>{fmtDate(ev.endsAt)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Miners Grid */}
                    {(ev.miners || []).length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                            {(ev.miners || []).map((m) => (
                                <div key={m.id} className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl hover:border-primary/30 transition-all duration-500 group relative overflow-hidden">
                                    <div className="relative z-10 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div className="px-3 py-1 bg-gray-900 rounded-full border border-gray-800 text-[9px] font-black text-gray-500 uppercase tracking-widest group-hover:text-primary transition-colors">
                                                Edição Limitada
                                            </div>
                                            <div className="flex items-center gap-1.5 text-amber-400">
                                                <TrendingUp className="w-3.5 h-3.5" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">Evento</span>
                                            </div>
                                        </div>

                                        {/* Estoque restante */}
                                        {m.remaining !== null && m.remaining !== undefined && (
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold w-fit ${
                                                m.remaining === 0
                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                    : m.remaining <= 5
                                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    : 'bg-green-500/10 text-green-400 border border-green-500/20'
                                            }`}>
                                                <Package className="w-3 h-3" />
                                                {m.remaining === 0
                                                    ? 'Esgotado'
                                                    : `${m.remaining} restante${m.remaining === 1 ? '' : 's'}`
                                                }
                                            </div>
                                        )}

                                        <div className="aspect-square bg-gray-900/50 rounded-3xl p-6 border border-gray-800 group-hover:scale-105 transition-transform duration-500 flex items-center justify-center">
                                            {m.imageUrl
                                                ? <img src={m.imageUrl} alt={m.name} className="w-full h-full object-contain" />
                                                : <Zap className="w-16 h-16 text-amber-500/30" />
                                            }
                                        </div>

                                        <div className="space-y-1">
                                            <h3 className="text-xl font-black text-white truncate">{m.name}</h3>
                                            <div className="flex items-center gap-2 text-primary font-bold">
                                                <Zap className="w-4 h-4" />
                                                <span className="text-sm">{formatHashrate(Number(m.hashRate) || 0)}</span>
                                            </div>
                                        </div>

                                        {/* Datas do evento no card */}
                                        <div className="bg-gray-900/40 rounded-2xl px-4 py-3 border border-gray-800/60 space-y-1.5">
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                <Clock className="w-3 h-3 shrink-0" />
                                                <span className="font-bold text-gray-600">Início:</span>
                                                <span>{fmtDate(ev.startsAt)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                <Clock className="w-3 h-3 shrink-0" />
                                                <span className="font-bold text-gray-600">Fim:</span>
                                                <span>{fmtDate(ev.endsAt)}</span>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-800/50 flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{t('shop.price')}</span>
                                                <span className="text-lg font-black text-white italic">
                                                    {Number(m.price).toFixed(6)}{' '}
                                                    <span className="text-xs font-bold text-gray-500 not-italic uppercase">{m.currency}</span>
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={!ev.isLive || !m.inStock}
                                                onClick={() => ev.isLive && m.inStock && openModal(ev, m)}
                                                className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {!ev.isLive ? 'Em Breve' : m.inStock ? t('offers.buy') : t('offers.sold_out')}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-0 translate-x-10 -translate-y-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-700" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {events.length === 0 && (
                <div className="rounded-3xl border border-dashed border-gray-800 p-16 text-center text-gray-500">
                    {t('offers.empty')}
                </div>
            )}

            {/* Confirm Modal — igual à Loja */}
            {modal && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-surface border border-gray-800 rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 relative">
                        <div className="absolute top-0 right-0 p-6">
                            <button onClick={() => setModal(null)} className="p-2 text-gray-500 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-10 text-center space-y-8">
                            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto border border-primary/20">
                                <Sparkles className="w-10 h-10 text-primary" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Confirmar Compra</h3>
                                <p className="text-gray-500 font-medium">Você está prestes a adquirir um equipamento de evento limitado.</p>
                            </div>
                            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-6 space-y-4">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="w-16 h-16 bg-gray-800 rounded-2xl p-2 border border-gray-700 flex items-center justify-center">
                                        {modal.miner.imageUrl
                                            ? <img src={modal.miner.imageUrl} className="w-full h-full object-contain" alt="" />
                                            : <Zap className="w-8 h-8 text-amber-500/40" />
                                        }
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white leading-none">{modal.miner.name}</h4>
                                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-2 block">
                                            {formatHashrate(Number(modal.miner.hashRate) || 0)}
                                        </span>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-gray-800 w-full" />
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Quantidade</span>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1} className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center justify-center disabled:opacity-30 transition-colors">
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="w-8 text-center font-black text-white text-sm">{quantity}</span>
                                        <button onClick={() => setQuantity(q => Math.min(MAX_QTY, q + 1))} disabled={quantity >= MAX_QTY} className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center justify-center disabled:opacity-30 transition-colors">
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-gray-800 w-full" />
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total a Pagar</span>
                                    <div className="text-right">
                                        <span className="text-xl font-black text-white italic">
                                            {(Number(modal.miner.price) * quantity).toFixed(6)}{' '}
                                            <span className="text-xs font-bold text-gray-500 not-italic uppercase">{modal.miner.currency}</span>
                                        </span>
                                        {quantity > 1 && <p className="text-[10px] text-gray-600 mt-0.5">{Number(modal.miner.price).toFixed(6)} × {quantity}</p>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={confirmBuy}
                                    disabled={buying}
                                    className="w-full py-5 bg-primary hover:bg-primary-hover text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
                                >
                                    {buying
                                        ? <Loader2 className="w-5 h-5 animate-spin" />
                                        : <><CheckCircle2 className="w-5 h-5" /> Confirmar Pagamento</>
                                    }
                                </button>
                                <button
                                    onClick={() => setModal(null)}
                                    disabled={buying}
                                    className="w-full py-4 text-gray-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-amber-500/50">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Esta ação é irreversível</span>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
