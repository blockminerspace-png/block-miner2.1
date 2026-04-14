import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Calendar, CheckCircle2, Trophy, Zap, Loader2, History, Gift, Lock, ExternalLink } from 'lucide-react';
import { api } from '../store/auth';
import { useWallet } from '../hooks/useWallet';
import { getBrowserEthereumProvider } from '../utils/walletProvider.js';

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

function formatMilestoneReward(m, t) {
    const rt = String(m.rewardType || '').toLowerCase();
    if (rt === 'pol' && Number(m.rewardValue) > 0) {
        return t('checkin.milestone_reward_pol', { value: String(m.rewardValue) });
    }
    if (rt === 'hashrate' && Number(m.rewardValue) > 0) {
        return t('checkin.milestone_reward_hashrate', {
            value: String(m.rewardValue),
            days: m.validityDays ?? 7
        });
    }
    return t('checkin.milestone_reward_none');
}

export default function Checkin() {
    const { t } = useTranslation();
    const translateCheckinApi = (code, fallbackMessage) => {
        if (!code) return fallbackMessage || t('common.error');
        const key = `checkin.errors.${code}`;
        const txt = t(key);
        return txt === key ? fallbackMessage || t('common.error') : txt;
    };
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
            const code = err.response?.data?.code;
            toast.error(translateCheckinApi(code, err.response?.data?.message));
        } finally {
            setIsClaiming(false);
        }
    };

    const submitTxToServer = async (txHash) => {
        try {
            const res = await api.post('/checkin/confirm', { txHash });
            const d = res.data;
            if (!d.ok && d.pending) {
                toast.message(translateCheckinApi(d.code, d.message));
            } else if (!d.ok) {
                toast.error(translateCheckinApi(d.code, d.message));
            } else if (d.ok && d.pending) {
                toast.message(d.message || t('checkin.waiting_blockchain'));
            }
            await fetchStatus();
            return d;
        } catch (err) {
            const d = err.response?.data;
            const status = err.response?.status;
            if (d?.code) {
                toast.error(translateCheckinApi(d.code, d.message));
                await fetchStatus();
                return d;
            }
            if (status === 503 && d?.message) {
                toast.error(translateCheckinApi(d.code, d.message));
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
            const submitted = await submitTxToServer(txHash.trim());
            if (submitted?.ok && submitted.status === 'confirmed') {
                toast.success(
                    t('checkin.reward_msg', { amount: `${formatPolFromWei(status.checkinAmountWei)} POL` })
                );
            }
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
            const d = res.data;
            if (d.ok && d.alreadyCheckedIn) {
                toast.success(t('checkin.claimed'));
            } else if (!d.ok && d.pending) {
                toast.message(translateCheckinApi(d.code, d.message));
            } else if (d.ok && d.status === 'confirmed') {
                toast.success(
                    t('checkin.reward_msg', { amount: `${formatPolFromWei(status.checkinAmountWei)} POL` })
                );
            } else if (!d.ok) {
                toast.error(translateCheckinApi(d.code, d.message));
            }
            await fetchStatus();
        } catch (err) {
            const code = err.response?.data?.code;
            toast.error(translateCheckinApi(code, err.response?.data?.message));
        } finally {
            setIsConfirming(false);
        }
    };

    const handleCheckinWallet = async () => {
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
            const res = await api.post('/checkin/wallet', { txHash: txHash.trim() });
            const d = res.data;
            if (d.ok && d.status === 'confirmed') {
                toast.success(
                    t('checkin.reward_msg', { amount: `${formatPolFromWei(status.checkinAmountWei)} POL` })
                );
                await fetchStatus();
            } else if (d.ok && d.alreadyCheckedIn) {
                toast.success(t('checkin.claimed'));
                await fetchStatus();
            } else if (!d.ok && d.pending) {
                toast.message(translateCheckinApi(d.code, d.message));
                await fetchStatus();
            } else if (!d.ok) {
                toast.error(translateCheckinApi(d.code, d.message));
                await fetchStatus();
            }
        } catch (err) {
            if (err?.code === 4001) {
                toast.error(t('checkin.rejected_wallet'));
            } else if (err.response?.data?.code) {
                toast.error(translateCheckinApi(err.response.data.code, err.response.data.message));
                await fetchStatus();
            } else {
                toast.error(err?.message || t('common.error'));
            }
        } finally {
            setIsPaying(false);
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

    if (!status?.ok || status?.statusDegraded) {
        return (
            <div className="p-8 text-center text-gray-400 space-y-3 max-w-md mx-auto">
                <p>{status?.statusDegraded ? t('checkin.status_degraded') : t('checkin.unavailable')}</p>
                {status?.statusDegraded ? (
                    <p className="text-xs text-slate-600">{t('checkin.status_degraded_hint')}</p>
                ) : null}
            </div>
        );
    }

    const streak = status.streak ?? 0;
    const totalConfirmed = status.totalConfirmed ?? 0;
    const recentCheckins = status.recentCheckins || [];
    const milestones = Array.isArray(status.milestones) ? status.milestones : [];
    const paymentMode = Boolean(status.paymentRequired && status.checkinReceiver);
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
                                <div className="space-y-4">
                                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                                        <div className="flex items-center justify-center gap-2 text-center font-bold text-amber-400 text-sm tracking-tight">
                                            <Zap className="h-4 w-4 shrink-0" aria-hidden />
                                            <span>{t('checkin.wallet_pay_line')}</span>
                                        </div>
                                    </div>

                                    {status.failed && (
                                        <p className="text-red-400 text-sm text-center">{t('checkin.failed_retry')}</p>
                                    )}

                                    {status.pending && (
                                        <div className="flex flex-col items-center gap-2 text-amber-400 text-sm">
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                {t('checkin.waiting_blockchain')}
                                            </div>
                                            {explorerTx ? (
                                                <a
                                                    href={explorerTx}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300"
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                    {t('checkin.view_on_polygonscan')}
                                                </a>
                                            ) : null}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleCheckinWallet}
                                        disabled={isPaying || !isConnected || isConnecting || status.pending}
                                        className="flex w-full min-h-[4.5rem] flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 rounded-[2rem] bg-amber-500 px-5 py-4 text-slate-950 shadow-xl shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-50"
                                    >
                                        {isPaying ? (
                                            <Loader2 className="h-6 w-6 animate-spin shrink-0" />
                                        ) : (
                                            <Zap className="h-6 w-6 shrink-0 fill-current" aria-hidden />
                                        )}
                                        <span className="flex flex-col items-center justify-center gap-0.5 text-center leading-tight">
                                            <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.12em]">
                                                {t('checkin.cta_wallet_line1')}
                                            </span>
                                            <span className="text-sm sm:text-base font-black tracking-wide normal-case">
                                                {t('checkin.cta_wallet_line2')}
                                            </span>
                                        </span>
                                    </button>

                                    {!isConnected && (
                                        <button
                                            type="button"
                                            onClick={() => connect()}
                                            disabled={isConnecting}
                                            className="w-full rounded-xl border border-primary/40 py-3 text-sm text-primary"
                                        >
                                            {isConnecting ? t('common.loading') : t('checkin.connect_browser_wallet')}
                                        </button>
                                    )}
                                    {isConnected && !isCorrectNetwork && (
                                        <button
                                            type="button"
                                            onClick={() => switchNetwork()}
                                            className="w-full rounded-xl border border-amber-500/30 py-3 text-sm text-amber-400"
                                        >
                                            {t('checkin.switch_polygon')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="space-y-4">
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
                                </>
                            )}
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

            {milestones.length > 0 && (
                <div className="space-y-4">
                    <div className="text-center space-y-1">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em]">{t('checkin.milestones_title')}</h3>
                        <p className="text-xs text-slate-600 max-w-xl mx-auto">{t('checkin.milestones_sub')}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {milestones.map((m) => {
                            const title =
                                (m.displayTitle && String(m.displayTitle).trim()) ||
                                `${m.dayThreshold} ${t('checkin.days')}`;
                            const state = m.state || 'locked';
                            const border =
                                state === 'claimed'
                                    ? 'border-emerald-500/35'
                                    : state === 'eligible'
                                      ? 'border-amber-500/40 ring-1 ring-amber-500/20'
                                      : 'border-gray-800 opacity-80';
                            const iconBg =
                                state === 'claimed'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : state === 'eligible'
                                      ? 'bg-amber-500/15 text-amber-400'
                                      : 'bg-slate-900 text-slate-600';
                            return (
                                <div
                                    key={m.id}
                                    className={`bg-gray-800/30 border rounded-2xl p-5 flex items-start gap-4 ${border}`}
                                >
                                    <div className={`p-3 rounded-xl shrink-0 ${iconBg}`}>
                                        {state === 'locked' ? <Lock className="w-5 h-5" /> : <Gift className="w-5 h-5" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {m.dayThreshold} {t('checkin.days').toUpperCase()}
                                        </p>
                                        <p className="text-sm font-bold text-white truncate">{title}</p>
                                        <p className="text-xs text-slate-400 mt-1">{formatMilestoneReward(m, t)}</p>
                                        {m.description ? (
                                            <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{m.description}</p>
                                        ) : null}
                                        <p className="text-[10px] font-bold uppercase tracking-wider mt-2 text-slate-500">
                                            {state === 'claimed'
                                                ? t('checkin.milestone_claimed')
                                                : state === 'eligible'
                                                  ? t('checkin.milestone_eligible')
                                                  : t('checkin.milestone_locked')}
                                        </p>
                                    </div>
                                    {state === 'claimed' && (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-1" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
