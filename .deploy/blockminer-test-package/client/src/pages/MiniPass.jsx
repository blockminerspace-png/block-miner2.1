import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Gift, Loader2, Lock, Sparkles, Trophy } from 'lucide-react';
import { api } from '../store/auth';

function msLeft(endsAtIso) {
  const t = new Date(endsAtIso).getTime() - Date.now();
  return Math.max(0, t);
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function MiniPass() {
  const { t, i18n } = useTranslation();
  const { seasonId: seasonIdParam } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);

  const seasonId = seasonIdParam ? parseInt(seasonIdParam, 10) : null;

  const loadList = useCallback(async () => {
    const res = await api.get('/mini-pass/seasons', {
      headers: { 'Accept-Language': i18n.language || 'en' }
    });
    if (res.data.ok) setList(res.data.seasons || []);
  }, [i18n.language]);

  const loadDetail = useCallback(async () => {
    if (!seasonId) return;
    const res = await api.get(`/mini-pass/seasons/${seasonId}`, {
      headers: { 'Accept-Language': i18n.language || 'en' }
    });
    if (res.data.ok) {
      setDetail(res.data);
    } else {
      toast.error(t('miniPass.errors.load_failed', 'Could not load Mini Pass'));
      navigate('/mini-pass');
    }
  }, [seasonId, i18n.language, navigate, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        if (seasonId) {
          await loadDetail();
        } else {
          await loadList();
        }
      } catch {
        if (!cancelled) toast.error(t('miniPass.errors.network', 'Network error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seasonId, loadDetail, loadList]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const countdown = useMemo(() => {
    if (!detail?.season?.endsAt) return '';
    return formatDuration(msLeft(detail.season.endsAt));
  }, [detail, tick]);

  const claim = async (levelRewardId) => {
    if (!seasonId) return;
    try {
      setAction(`claim-${levelRewardId}`);
      const res = await api.post(`/mini-pass/seasons/${seasonId}/claim/${levelRewardId}`);
      if (res.data.ok) {
        toast.success(
          res.data.duplicate
            ? t('miniPass.claim_already', 'Already claimed')
            : t('miniPass.claim_ok', 'Reward claimed')
        );
        loadDetail();
      }
    } catch (e) {
      const code = e.response?.data?.code;
      toast.error(
        code === 'not_eligible'
          ? t('miniPass.errors.not_eligible', 'Reach the tier level first')
          : t('miniPass.errors.claim_failed', 'Claim failed')
      );
    } finally {
      setAction(null);
    }
  };

  const buyLevel = async (qty = 1) => {
    if (!seasonId) return;
    try {
      setAction('buy');
      const res = await api.post(`/mini-pass/seasons/${seasonId}/buy-level`, { quantity: qty });
      if (res.data.ok) {
        toast.success(t('miniPass.buy_ok', 'Level purchase complete'));
        loadDetail();
      }
    } catch (e) {
      toast.error(
        e.response?.data?.code === 'insufficient_balance'
          ? t('miniPass.errors.insufficient_pol', 'Insufficient POL')
          : t('miniPass.errors.purchase_failed', 'Purchase failed')
      );
    } finally {
      setAction(null);
    }
  };

  const completePass = async () => {
    if (!seasonId) return;
    try {
      setAction('complete');
      const res = await api.post(`/mini-pass/seasons/${seasonId}/complete-pass`);
      if (res.data.ok) {
        toast.success(t('miniPass.complete_ok', 'Pass completed'));
        loadDetail();
      }
    } catch (e) {
      toast.error(t('miniPass.errors.purchase_failed', 'Purchase failed'));
    } finally {
      setAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!seasonId) {
    return (
      <div className="space-y-8 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
          {t('miniPass.title', 'Mini Pass')}
        </h1>
        <p className="text-slate-400 text-sm">{t('miniPass.subtitle', 'Seasonal missions and rewards')}</p>
        {list.length === 0 ? (
          <p className="text-slate-500">{t('miniPass.no_seasons', 'No active season right now.')}</p>
        ) : (
          <ul className="space-y-3">
            {list.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/mini-pass/${s.id}`}
                  className="block rounded-2xl border border-white/10 bg-slate-900/50 p-5 hover:border-amber-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-white">{s.title}</h2>
                      {s.subtitle ? <p className="text-xs text-slate-500 mt-1">{s.subtitle}</p> : null}
                    </div>
                    <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!detail) return null;

  const { season, progress, missions, rewards } = detail;
  const levelPct =
    progress.level >= season.maxLevel
      ? 100
      : Math.min(100, (progress.xpIntoLevel / Math.max(1, season.xpPerLevel)) * 100);

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <button
        type="button"
        onClick={() => navigate('/mini-pass')}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('miniPass.back', 'All seasons')}
      </button>

      <header
        className="rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8"
        style={
          season.bannerImageUrl
            ? {
                backgroundImage: `linear-gradient(135deg,rgba(2,6,23,.92),rgba(15,23,42,.88)),url(${season.bannerImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{season.title}</h1>
            {season.subtitle ? <p className="text-slate-400 text-sm mt-2">{season.subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2 text-amber-400 text-sm font-mono">
            <Clock className="w-4 h-4" />
            {countdown}
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-xs text-slate-500 uppercase tracking-widest">
            <span>
              {t('miniPass.level_label', 'Level')} {progress.level} / {season.maxLevel}
            </span>
            <span>
              {progress.totalXp} / {progress.xpCap} XP
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-400"
              initial={false}
              animate={{ width: `${levelPct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={action === 'buy' || progress.xpRemainingToCap <= 0}
            onClick={() => buyLevel(1)}
            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase disabled:opacity-40"
          >
            {t('miniPass.buy_level', 'Buy level')}
          </button>
          <button
            type="button"
            disabled={action === 'complete' || progress.xpRemainingToCap <= 0}
            onClick={() => completePass()}
            className="px-4 py-2 rounded-xl border border-amber-500/50 text-amber-400 text-xs font-black uppercase disabled:opacity-40"
          >
            {t('miniPass.complete_pass', 'Complete pass')}
          </button>
        </div>
      </header>

      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          {t('miniPass.missions', 'Missions')}
        </h2>
        <ul className="space-y-2">
          {missions.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-white/5 bg-slate-900/40 px-4 py-3 text-sm"
            >
              <div className="flex justify-between gap-2">
                <span className="text-white font-medium">{m.title}</span>
                <span className="text-amber-400 text-xs font-mono">+{m.xpReward} XP</span>
              </div>
              {m.description ? <p className="text-xs text-slate-500 mt-1">{m.description}</p> : null}
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500/80 transition-all"
                  style={{
                    width: `${Math.min(100, (m.currentValue / Math.max(1, m.targetValue)) * 100)}%`
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                {m.currentValue} / {m.targetValue}
                {m.completed ? ` · ${t('miniPass.done', 'Done')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-500" />
          {t('miniPass.rewards_track', 'Reward track')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence>
            {rewards.map((r) => {
              const locked = !r.unlocked;
              const showSpark = r.unlocked && !r.claimed;
              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl border px-4 py-4 flex flex-col gap-2 ${
                    r.claimed
                      ? 'border-emerald-500/30 bg-emerald-950/20'
                      : locked
                        ? 'border-slate-800 bg-slate-950/50'
                        : 'border-amber-500/40 bg-amber-950/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 uppercase">Lv {r.level}</span>
                    {locked ? <Lock className="w-4 h-4 text-slate-600" /> : null}
                    {showSpark ? <Sparkles className="w-4 h-4 text-amber-400" /> : null}
                  </div>
                  <p className="text-white font-semibold text-sm">
                    {r.title || `${r.rewardKind}`}
                  </p>
                  <button
                    type="button"
                    disabled={locked || r.claimed || action === `claim-${r.id}`}
                    onClick={() => claim(r.id)}
                    className="mt-auto text-xs font-black uppercase py-2 rounded-lg bg-amber-500 text-slate-950 disabled:opacity-30 disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {r.claimed
                      ? t('miniPass.claimed', 'Claimed')
                      : locked
                        ? t('miniPass.locked', 'Locked')
                        : t('miniPass.claim', 'Claim')}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
