import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Grid3X3 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../store/auth';

function tileBgClass(v) {
  if (v <= 0) return 'bg-slate-800/60';
  const map = {
    2: 'bg-slate-700',
    4: 'bg-slate-600',
    8: 'bg-amber-900/80 text-amber-100',
    16: 'bg-amber-800/90 text-amber-50',
    32: 'bg-orange-800/90 text-orange-50',
    64: 'bg-orange-700 text-white',
    128: 'bg-yellow-500/90 text-slate-900',
    256: 'bg-yellow-400 text-slate-900',
    512: 'bg-lime-400 text-slate-900',
    1024: 'bg-emerald-400 text-slate-900',
    2048: 'bg-primary text-white shadow-lg shadow-primary/40',
  };
  return map[v] || 'bg-violet-600 text-white';
}

export default function Game2048Page() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null);
  const touchRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/games/2048/status');
      if (data?.ok) {
        setStatus(data);
        if (data.activeSession) setSession(data.activeSession);
        else setSession(null);
      }
    } catch {
      toast.error(t('game2048.errors.load_status'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onKeyDown = useCallback(
    (e) => {
      if (!session || session.status !== 'ACTIVE' || busy) return;
      const key = e.key;
      let dir = null;
      if (key === 'ArrowUp') dir = 'up';
      else if (key === 'ArrowDown') dir = 'down';
      else if (key === 'ArrowLeft') dir = 'left';
      else if (key === 'ArrowRight') dir = 'right';
      if (!dir) return;
      e.preventDefault();
      void sendMove(dir);
    },
    [session, busy]
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const sendMove = async (direction) => {
    if (!session?.id || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post('/games/2048/move', {
        sessionId: session.id,
        direction,
      });
      if (!data?.ok) {
        const code = data?.code;
        const msg = code ? t(`game2048.errors.${code}`, { defaultValue: t('game2048.errors.move_failed') }) : t('game2048.errors.move_failed');
        toast.error(msg);
        return;
      }
      if (data.session) setSession(data.session);
    } catch {
      toast.error(t('game2048.errors.move_failed'));
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/games/2048/start');
      if (!data?.ok) {
        if (data?.code === 'COOLDOWN_ACTIVE') {
          toast.error(t('game2048.errors.COOLDOWN_ACTIVE'));
        } else {
          toast.error(t('game2048.errors.start_failed'));
        }
        await refreshStatus();
        return;
      }
      if (data.session) setSession(data.session);
      await refreshStatus();
    } catch {
      toast.error(t('game2048.errors.start_failed'));
    } finally {
      setBusy(false);
    }
  };

  const claimReward = async () => {
    if (!session?.id || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post('/games/2048/claim', { sessionId: session.id });
      if (!data?.ok) {
        const code = data?.code;
        const msg = code
          ? t(`game2048.errors.${code}`, { defaultValue: t('game2048.errors.claim_failed') })
          : t('game2048.errors.claim_failed');
        toast.error(msg);
        return;
      }
      if (!data.idempotent) {
        toast.success(
          t('game2048.claimed_toast', {
            hr: data.rewardHashRate,
            days: data.powerDays,
          })
        );
      }
      await refreshStatus();
    } catch {
      toast.error(t('game2048.errors.claim_failed'));
    } finally {
      setBusy(false);
    }
  };

  const onTouchStart = (e) => {
    const t0 = e.changedTouches?.[0];
    if (!t0) return;
    touchRef.current = { x: t0.clientX, y: t0.clientY, t: Date.now() };
  };

  const onTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || !session || session.status !== 'ACTIVE' || busy) return;
    const t1 = e.changedTouches?.[0];
    if (!t1) return;
    const dx = t1.clientX - start.x;
    const dy = t1.clientY - start.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 24) return;
    if (ax > ay) void sendMove(dx > 0 ? 'right' : 'left');
    else void sendMove(dy > 0 ? 'down' : 'up');
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        {t('game2048.loading')}
      </div>
    );
  }

  const winTile = session?.winTile ?? status?.winTile ?? 2048;
  const minScore = session?.minScore ?? status?.minScore ?? 0;
  const rewardHr = session?.rewardHashRate ?? status?.rewardHashRate ?? 50;
  const powerDays = status?.powerDays ?? 7;
  const cdSec = status?.cooldownSecondsRemaining ?? 0;
  const canStartNew = Boolean(status?.allowNewStart) && (!session || session.status !== 'ACTIVE');
  const board = session?.board;
  const best = board ? Math.max(...board.flat()) : 0;

  const cooldownMinutesDisplay = status?.cooldownMinutesHint || 3;

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/games"
            className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('game2048.back_arena')}
          </Link>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white">{t('game2048.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('game2048.subtitle')}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-right">
          <Grid3X3 className="mx-auto mb-1 h-6 w-6 text-primary opacity-80" aria-hidden />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('game2048.score')}</p>
          <p className="text-2xl font-black tabular-nums text-white">{session?.score ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('game2048.best_tile')}</p>
          <p className="text-2xl font-black tabular-nums text-primary">{best}</p>
        </div>
        <div className="col-span-2 text-xs text-slate-500">
          {t('game2048.target_hint', { tile: winTile, minScore })}
        </div>
        <div className="col-span-2 text-xs text-slate-400">
          {t('game2048.reward_line', { hr: rewardHr, days: powerDays })}
        </div>
        {cooldownMinutesDisplay > 0 && (
          <div className="col-span-2 text-xs text-slate-500">
            {t('game2048.cooldown_line', { minutes: cooldownMinutesDisplay })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canStartNew && (
          <button
            type="button"
            onClick={() => void startGame()}
            disabled={busy || !status?.allowNewStart}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-primary/25 disabled:opacity-50"
          >
            {t('game2048.new_game')}
          </button>
        )}
        {session?.canClaim && (
          <button
            type="button"
            onClick={() => void claimReward()}
            disabled={busy}
            className="rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-5 py-3 text-sm font-black uppercase tracking-wide text-emerald-300 disabled:opacity-50"
          >
            {busy ? t('game2048.claiming') : t('game2048.claim')}
          </button>
        )}
      </div>

      {cdSec > 0 && !session && (
        <p className="text-center text-sm text-amber-400">
          {t('game2048.errors.COOLDOWN_ACTIVE')} ({cdSec}s)
        </p>
      )}

      {session && board && (
        <div
          role="grid"
          aria-label={t('game2048.grid_aria')}
          className="relative mx-auto aspect-square w-full max-w-[min(100vw-2rem,420px)] touch-none rounded-2xl border border-slate-800 bg-slate-950/80 p-2 sm:p-3"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-1.5 sm:gap-2">
            {board.map((row, ri) =>
              row.map((value, ci) => (
                <div
                  key={`cell-${ri}-${ci}`}
                  className="relative flex items-center justify-center overflow-hidden rounded-lg bg-slate-800/40"
                >
                  <AnimatePresence mode="popLayout">
                    {value > 0 && (
                      <motion.div
                        layout
                        key={`${ri}-${ci}-${value}`}
                        initial={{ scale: 0.85, opacity: 0.7 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                        className={`flex h-[90%] w-[90%] items-center justify-center rounded-lg text-[clamp(0.7rem,4.5vw,1.35rem)] font-black tabular-nums ${tileBgClass(value)}`}
                        aria-label={t('game2048.tile_aria', { row: ri + 1, col: ci + 1, value })}
                      >
                        {value}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
          {session.gameOver && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-slate-950/75 p-4 text-center">
              <p className="text-lg font-black uppercase text-white">
                {session.won ? t('game2048.you_won') : t('game2048.game_over')}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-slate-500">{t('game2048.play_hint')}</p>

      {busy && <p className="text-center text-xs text-slate-500">{t('game2048.syncing')}</p>}
    </div>
  );
}
