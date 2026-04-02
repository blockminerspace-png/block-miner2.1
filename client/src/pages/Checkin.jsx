import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Calendar, CheckCircle2, Star, Trophy, Zap, Loader2, History } from 'lucide-react';
import { api } from '../store/auth';
import { useWallet } from '../hooks/useWallet';
import { getBrowserEthereumProvider } from '../utils/walletProvider.js';

const POLYGON_HEX = '0x89';

function shortenAddr(a) {
    if (!a || a.length < 12) return a || '';
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function weiHexFromDecimalString(weiStr) {
    try {
        const v = BigInt(weiStr);
        return `0x${v.toString(16)}`;
    } catch {
        return '0x0';
    }
}

function formatPolFromWei(weiStr) {
    try {
        const n = Number(BigInt(weiStr)) / 1e18;
        if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, '');
        return n.toFixed(6).replace(/\.?0+$/, '');
    } catch {
        return '?';
    }
}

function mergeStatus(prev, incoming) {
    if (!incoming) return prev;
    return { ...prev, ...incoming };
}

export default function Checkin() {
    const { t } = useTranslation();
    const { account, isConnected, isCorrectNetwork, connect, isConnecting, switchNetwork } = useWallet();
    const [status, setStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaying, setIsPaying] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const pollRef = useRef(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/checkin/status');
            if (res.data.ok) {
                setStatus((s) => mergeStatus(s, res.data));
                return res.data;
            }
            setStatus({ ok: false });
        } catch (err) {
            console.error('Check-in status', err);
            setStatus({ ok: false });
        }
        return null;
    }, []);

    const load = useCallback(async () => {
        setIsLoading(true);
        await fetchStatus();
        setIsLoading(false);
    }, [fetchStatus]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const pay = status?.paymentRequired;
        const needPoll =
            pay &&
            status &&
            (status.pending || (status.txHash && !status.checkedIn && !status.failed));
        if (!needPoll) {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
            return;
        }
        pollRef.current = setInterval(() => {
            fetchStatus();
        }, 4000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [status, fetchStatus]);

    const handleClaimFree = async () => {
        if (isClaiming) return;
        setIsClaiming(true);
        try {
            const res = await api.post('/checkin/claim');
            if (res.data.ok) {
                if (res.data.alreadyCheckedIn) {
                    toast.success(t('checkin.claimed'));
                } else {
                    toast.success(t('checkin.claim_success'));
                }
                setStatus((s) =>
                    mergeStatus(s, {
                        checkedIn: true,
                        pending: false,
                        failed: false,
                        status: 'confirmed',
                        streak: res.data.streak,
                        recentCheckins: res.data.recentCheckins
                    })
                );
                await fetchStatus();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsClaiming(false);
        }
    };

    const submitTxToServer = async (txHash) => {
        try {
            const res = await api.post('/checkin/confirm', { txHash });
            if (res.data.ok && res.data.pending) {
                toast.message(res.data.message || t('checkin.waiting_blockchain'));
            }
            await fetchStatus();
            return res.data;
        } catch (err) {
            const d = err.response?.data;
            if (d?.pending) {
                toast.message(d.message || t('checkin.waiting_blockchain'));
                await fetchStatus();
                return d;
            }
            throw err;
        }
    };

    const handlePay = async () => {
        if (!status?.checkinReceiver || !status?.checkinAmountWei) {
            toast.error(t('common.error'));
            return;
        }
        if (!isConnected || !account) {
            toast.error(t('checkin.link_wallet_first'));
            return;
        }
        if (!isCorrectNetwork) {
            await switchNetwork();
            toast.message(t('checkin.wrong_network'));
            return;
        }
        const provider = getBrowserEthereumProvider();
        if (!provider) {
            toast.error(t('checkin.no_wallet'));
            return;
        }
        setIsPaying(true);
        try {
            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [
                    {
                        from: account,
                        to: status.checkinReceiver,
                        value: weiHexFromDecimalString(status.checkinAmountWei)
                    }
                ]
            });
            if (!txHash || typeof txHash !== 'string') {
                throw new Error('No transaction hash');
            }
            await submitTxToServer(txHash.trim());
            toast.success(t('checkin.tx_sent'));
        } catch (err) {
            if (err?.code === 4001) {
                toast.error(t('checkin.rejected_wallet'));
            } else {
                toast.error(err?.message || t('common.error'));
            }
        } finally {
            setIsPaying(false);
        }
    };

    const handleCompleteCheckin = async () => {
        const hash = status?.txHash;
        if (!hash) {
            toast.error(t('checkin.no_tx_yet'));
            return;
        }
        setIsConfirming(true);
        try {
            const res = await api.post('/checkin/confirm', { txHash: hash });
            if (res.data.ok && res.data.alreadyCheckedIn) {
                toast.success(t('checkin.claimed'));
            } else if (res.data.ok && res.data.pending) {
                toast.message(t('checkin.waiting_blockchain'));
            } else if (res.data.ok && res.data.status === 'confirmed') {
                toast.success(t('checkin.reward_msg', { amount: formatPolFromWei(status.checkinAmountWei) + ' POL' }));
            }
            await fetchStatus();
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsConfirming(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16 text-gray-400 gap-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                {t('common.loading')}
            </div>
        );
    }

    if (!status?.ok) {
        return (
            <div className="p-8 text-center text-gray-400">
                {t('checkin.unavailable')}
            </div>
        );
    }

    const streak = status.streak ?? 0;
    const totalConfirmed = status.totalConfirmed ?? 0;
    const recentCheckins = status.recentCheckins || [];
    const paymentMode = Boolean(status.paymentRequired && status.checkinReceiver);
    const amountLabel = formatPolFromWei(status.checkinAmountWei || '0');
    const explorerTx = status.txHash ? `https://polygonscan.com/tx/${status.txHash}` : null;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-4">
                <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl mb-2">
                    <Calendar className="w-8 h-8 text-amber-500" />
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">{t('checkin.title')}</h1>
                <p className="text-gray-500 font-medium max-w-lg mx-auto">
                    {paymentMode ? t('checkin.subtitle') : t('checkin.subtitle_free')}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-10 shadow-xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-8">{t('checkin.streak')}</h3>
                        <div className="flex items-center gap-6">
                            <div className="w-24 h-24 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform duration-500">
                                <Trophy className="text-white w-12 h-12" />
                            </div>
                            <div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-6xl font-black text-white tracking-tighter">{streak}</span>
                                    <span className="text-xl font-bold text-amber-500 uppercase">{t('checkin.days')}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
                                    {t('checkin.streak_sub')}
                                </p>
                                {totalConfirmed > 0 && (
                                    <p className="text-[10px] text-slate-600 mt-2">
                                        {t('checkin.total_days')}: <span className="text-slate-400 font-mono">{totalConfirmed}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/5 rounded-tl-[100px] -z-0" />
                </div>

                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-10 shadow-xl flex flex-col justify-center space-y-6">
                    {status.checkedIn ? (
                        <div className="text-center space-y-6">
                            <div className="flex justify-center">
                                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white">{t('checkin.claimed')}</h3>
                                <p className="text-sm text-gray-500 font-medium mt-2">{t('checkin.come_back')}</p>
                            </div>
                        </div>
                    ) : paymentMode ? (
                        <>
                            {!status.walletLinked ? (
                                <div className="text-center space-y-4">
                                    <p className="text-gray-400 text-sm">{t('checkin.link_wallet_hint')}</p>
                                    <Link
                                        to="/wallet"
                                        className="inline-flex items-center justify-center gap-2 w-full py-4 bg-primary text-white rounded-2xl font-bold"
                                    >
                                        {t('checkin.open_wallet')}
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 text-sm space-y-2">
                                        <p className="text-amber-500 font-bold uppercase tracking-wider text-xs">{t('checkin.payment_info')}</p>
                                        <p className="text-white">
                                            <span className="text-gray-500">{t('checkin.amount')} </span>
                                            <span className="font-mono font-bold">{amountLabel} POL</span>
                                        </p>
                                        <p className="text-gray-400 break-all">
                                            <span className="text-gray-500 block mb-1">{t('checkin.send_to')}</span>
                                            {shortenAddr(status.checkinReceiver)}
                                        </p>
                                        <p className="text-gray-500 text-xs">{t('checkin.polygon_only')}</p>
                                    </div>

                                    {status.failed && (
                                        <p className="text-red-400 text-sm text-center">{t('checkin.failed_retry')}</p>
                                    )}

                                    {status.pending && (
                                        <div className="flex items-center gap-2 justify-center text-amber-400 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t('checkin.waiting_blockchain')}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handlePay}
                                        disabled={isPaying || isConfirming || status.pending}
                                        className="w-full py-5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl shadow-amber-500/20 flex items-center justify-center gap-3"
                                    >
                                        {isPaying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                                        {t('checkin.send_payment')}
                                    </button>

                                    {status.txHash ? (
                                        <button
                                            type="button"
                                            onClick={handleCompleteCheckin}
                                            disabled={isConfirming || isPaying}
                                            className="w-full py-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-2xl font-bold text-sm text-white"
                                        >
                                            {isConfirming ? t('common.loading') : t('checkin.complete_checkin')}
                                        </button>
                                    ) : null}

                                    {!isConnected && (
                                        <button
                                            type="button"
                                            onClick={() => connect()}
                                            disabled={isConnecting}
                                            className="w-full py-3 text-sm text-primary border border-primary/40 rounded-xl"
                                        >
                                            {isConnecting ? t('common.loading') : t('checkin.connect_browser_wallet')}
                                        </button>
                                    )}
                                    {isConnected && !isCorrectNetwork && (
                                        <button
                                            type="button"
                                            onClick={() => switchNetwork()}
                                            className="w-full py-3 text-sm text-amber-400 border border-amber-500/30 rounded-xl"
                                        >
                                            {t('checkin.switch_polygon')} ({POLYGON_HEX})
                                        </button>
                                    )}
                                </>
                            )}
                        </>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-center text-sm text-gray-400">{t('checkin.free_hint')}</p>
                            <button
                                type="button"
                                onClick={handleClaimFree}
                                disabled={isClaiming}
                                className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3"
                            >
                                {isClaiming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />}
                                {t('checkin.claim_today')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {recentCheckins.length > 0 && (
                <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-8 shadow-xl">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <History className="w-4 h-4 text-amber-500" />
                        {t('checkin.history_title')}
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                        {recentCheckins.map((row) => (
                            <li
                                key={row.date}
                                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400/90"
                            >
                                {row.date}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <p className="text-center text-xs text-slate-600 max-w-xl mx-auto">
                {paymentMode ? t('checkin.server_note') : t('checkin.server_note_free')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[7, 15, 30].map((milestone) => (
                    <div
                        key={milestone}
                        className={`bg-gray-800/30 border rounded-2xl p-6 flex items-center gap-4 ${
                            streak >= milestone ? 'border-amber-500/30 opacity-100' : 'border-gray-800 opacity-50'
                        }`}
                    >
                        <div
                            className={`p-3 rounded-xl ${
                                streak >= milestone ? 'bg-amber-500/10 text-amber-500' : 'bg-gray-900 text-gray-600'
                            }`}
                        >
                            <Star className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {milestone} {t('checkin.days').toUpperCase()}
                            </p>
                            <p className="text-sm font-bold text-white">{t('checkin.milestone_bonus')}</p>
                        </div>
                        {streak >= milestone && <CheckCircle2 className="ml-auto w-5 h-5 text-emerald-500" />}
                    </div>
                ))}
            </div>
        </div>
    );
}
