import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../store/auth";
import { CRYPTO_ICONS, COIN_COLORS, cryptoSlugFor2048Tile } from "../games/cryptoGameIcons.js";

function useRoundSecondsRemaining(session) {
  const [tick, setTick] = useState(0);
  const limit = session?.timeLimitSeconds ?? 0;
  const startedAt = session?.startedAt;
  const active = session?.status === "ACTIVE" && !session?.gameOver;

  useEffect(() => {
    if (!active || limit <= 0) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [active, limit, session?.id]);

  return useMemo(() => {
    if (!startedAt || limit <= 0) return null;
    const end = new Date(startedAt).getTime() + limit * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / 1000));
  }, [startedAt, limit, tick]);
}

function Chain2048Tile({ value, row, col, t }) {
  const slug = value > 0 ? cryptoSlugFor2048Tile(value) : null;
  const scheme = slug ? COIN_COLORS[slug] || COIN_COLORS.ethereum : null;
  const iconSrc = slug ? CRYPTO_ICONS[slug] || CRYPTO_ICONS.ethereum : null;

  return (
    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-900/60 ring-1 ring-inset ring-white/[0.06]">
      <AnimatePresence mode="popLayout">
        {value > 0 && scheme && iconSrc ? (
          <motion.div
            layout
            key={`${row}-${col}-${value}`}
            initial={{ scale: 0.88, opacity: 0.75 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.82, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="relative flex h-[88%] w-[88%] items-center justify-center overflow-hidden rounded-md shadow-inner"
            style={{
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: scheme.border,
              background: `linear-gradient(145deg, ${scheme.bg}, rgba(8,12,22,0.92))`,
              boxShadow: `0 0 12px -3px ${scheme.glow}`,
            }}
            aria-label={t("game2048.tile_aria", { row: row + 1, col: col + 1, value })}
          >
            <img
              src={iconSrc}
              alt=""
              className="pointer-events-none h-[62%] w-[62%] object-contain brightness-0 invert drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
              draggable={false}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function endOverlayKey(session) {
  if (!session?.gameOver) return null;
  if (session.won) return "won";
  const limit = session.timeLimitSeconds ?? 0;
  if (session.hasMoves && limit > 0 && session.startedAt && session.endedAt) {
    const elapsed = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
    if (elapsed >= limit * 1000 - 1500) return "time";
  }
  if (session.hasMoves) return "closed";
  return "lost";
}

export default function Game2048Page() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null);
  const touchRef = useRef(null);
  const timeoutRefreshRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/games/2048/status");
      if (data?.ok) {
        setStatus(data);
        if (data.activeSession) setSession(data.activeSession);
        else setSession(null);
      }
    } catch {
      toast.error(t("game2048.errors.load_status"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const roundSeconds = useRoundSecondsRemaining(session);

  useEffect(() => {
    if (roundSeconds !== 0 || !session || session.status !== "ACTIVE" || session.gameOver) {
      timeoutRefreshRef.current = false;
      return;
    }
    if ((session.timeLimitSeconds ?? 0) <= 0) return;
    if (timeoutRefreshRef.current) return;
    timeoutRefreshRef.current = true;
    void refreshStatus();
  }, [roundSeconds, session, refreshStatus]);

  const sendMove = useCallback(
    async (direction) => {
      if (!session?.id || busy) return;
      if (session.status !== "ACTIVE" || session.gameOver) return;
      if ((session.timeLimitSeconds ?? 0) > 0 && roundSeconds === 0) return;
      setBusy(true);
      try {
        const { data } = await api.post("/games/2048/move", {
          sessionId: session.id,
          direction,
        });
        if (!data?.ok) {
          const code = data?.code;
          const msg = code
            ? t(`game2048.errors.${code}`, { defaultValue: t("game2048.errors.move_failed") })
            : t("game2048.errors.move_failed");
          toast.error(msg);
          if (data?.session) setSession(data.session);
          return;
        }
        if (data.session) setSession(data.session);
      } catch {
        toast.error(t("game2048.errors.move_failed"));
      } finally {
        setBusy(false);
      }
    },
    [session, busy, t, roundSeconds],
  );

  const onKeyDown = useCallback(
    (e) => {
      if (!session || session.status !== "ACTIVE" || session.gameOver || busy) return;
      if ((session.timeLimitSeconds ?? 0) > 0 && roundSeconds === 0) return;
      const key = e.key;
      let dir = null;
      if (key === "ArrowUp") dir = "up";
      else if (key === "ArrowDown") dir = "down";
      else if (key === "ArrowLeft") dir = "left";
      else if (key === "ArrowRight") dir = "right";
      if (!dir) return;
      e.preventDefault();
      void sendMove(dir);
    },
    [session, busy, sendMove, roundSeconds],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const startGame = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/2048/start");
      if (!data?.ok) {
        if (data?.code === "COOLDOWN_ACTIVE") {
          toast.error(t("game2048.errors.COOLDOWN_ACTIVE"));
        } else {
          toast.error(t("game2048.errors.start_failed"));
        }
        await refreshStatus();
        return;
      }
      if (data.session) setSession(data.session);
      await refreshStatus();
    } catch {
      toast.error(t("game2048.errors.start_failed"));
    } finally {
      setBusy(false);
    }
  };

  const restartGame = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/2048/restart");
      if (!data?.ok) {
        if (data?.code === "COOLDOWN_ACTIVE") {
          toast.error(t("game2048.errors.COOLDOWN_ACTIVE"));
        } else {
          toast.error(t("game2048.errors.restart_failed"));
        }
        await refreshStatus();
        return;
      }
      if (data.session) setSession(data.session);
      await refreshStatus();
    } catch {
      toast.error(t("game2048.errors.restart_failed"));
    } finally {
      setBusy(false);
    }
  };

  const claimReward = async () => {
    if (!session?.id || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/games/2048/claim", { sessionId: session.id });
      if (!data?.ok) {
        const code = data?.code;
        const msg = code
          ? t(`game2048.errors.${code}`, { defaultValue: t("game2048.errors.claim_failed") })
          : t("game2048.errors.claim_failed");
        toast.error(msg);
        return;
      }
      if (!data.idempotent) {
        toast.success(
          t("game2048.claimed_toast", {
            hr: data.rewardHashRate,
            days: data.powerDays,
          }),
        );
      }
      await refreshStatus();
    } catch {
      toast.error(t("game2048.errors.claim_failed"));
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
    if (!start || !session || session.status !== "ACTIVE" || session.gameOver || busy) return;
    if ((session.timeLimitSeconds ?? 0) > 0 && roundSeconds === 0) return;
    const t1 = e.changedTouches?.[0];
    if (!t1) return;
    const dx = t1.clientX - start.x;
    const dy = t1.clientY - start.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 24) return;
    if (ax > ay) void sendMove(dx > 0 ? "right" : "left");
    else void sendMove(dy > 0 ? "down" : "up");
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">{t("game2048.loading")}</div>
    );
  }

  const winTile = session?.winTile ?? status?.winTile ?? 2048;
  const minScore = session?.minScore ?? status?.minScore ?? 0;
  const rewardHr = session?.rewardHashRate ?? status?.rewardHashRate ?? 50;
  const powerDays = status?.powerDays ?? 7;
  const cdSec = status?.cooldownSecondsRemaining ?? 0;
  const canStartNew = Boolean(status?.allowNewStart) && (!session || session.status !== "ACTIVE");
  const board = session?.board;
  const best = board ? Math.max(...board.flat()) : 0;
  const cooldownMinutesDisplay = status?.cooldownMinutesHint || 3;
  const displaySeconds = roundSeconds ?? session?.secondsRemaining ?? 0;
  const showTimer = (session?.timeLimitSeconds ?? 0) > 0 && session?.status === "ACTIVE" && !session?.gameOver;
  const overlayKind = session ? endOverlayKey(session) : null;

  return (
    <div
      className="mx-auto min-h-[calc(100vh-6rem)] max-w-lg animate-in space-y-5 pb-16 fade-in duration-700"
      style={{ direction: "ltr" }}
    >
      <div className="px-1 pt-2">
        <Link
          to="/games"
          className="mb-2 inline-flex min-h-10 items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-sky-400"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("game2048.back_arena")}
        </Link>
        <h1 className="sr-only">{t("game2048.title")}</h1>
      </div>

      <div className="rounded-2xl border border-slate-800/80 bg-[#070b14] px-3 py-3 shadow-[0_0_40px_-12px_rgba(37,99,235,0.25)] sm:px-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{t("game2048.score")}</p>
            <p className="text-xl font-black tabular-nums text-white sm:text-2xl">{session?.score ?? 0}</p>
          </div>
          <div className="shrink-0 text-center">
            <p
              className="bg-gradient-to-b from-sky-300 via-blue-400 to-indigo-600 bg-clip-text text-lg font-black uppercase italic leading-none tracking-tight text-transparent drop-shadow-sm sm:text-xl"
              aria-hidden
            >
              {t("game2048.brand")}
            </p>
            <span className="sr-only">{t("game2048.brand_aria")}</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
            {(showTimer || (session?.timeLimitSeconds ?? 0) > 0) && (
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  <Clock className="h-3 w-3" aria-hidden />
                  {t("game2048.time")}
                </p>
                <p className="text-lg font-black tabular-nums text-sky-300 sm:text-xl">
                  {showTimer ? displaySeconds : 0}
                  <span className="text-xs font-bold text-slate-500">{t("game2048.seconds_suffix")}</span>
                </p>
              </div>
            )}
            {session?.status === "ACTIVE" && !session?.gameOver && (
              <button
                type="button"
                onClick={() => void restartGame()}
                disabled={busy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 transition-opacity hover:opacity-90 disabled:opacity-40"
                aria-label={t("game2048.reset_aria")}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="mb-3 space-y-1 border-t border-slate-800/80 pt-3 text-[11px] leading-snug text-slate-500">
          <p>
            {t("game2048.target_hint", { tile: winTile, minScore })} · {t("game2048.best_tile")}:{" "}
            <span className="font-bold text-sky-400">{best}</span>
          </p>
          <p>{t("game2048.reward_line", { hr: rewardHr, days: powerDays })}</p>
          {cooldownMinutesDisplay > 0 && <p>{t("game2048.cooldown_line", { minutes: cooldownMinutesDisplay })}</p>}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-800/80 pt-3">
          {canStartNew && (
            <button
              type="button"
              onClick={() => void startGame()}
              disabled={busy || !status?.allowNewStart}
              className="min-h-11 rounded-xl bg-sky-600 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-sky-900/30 transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              {t("game2048.new_game")}
            </button>
          )}
          {session?.canClaim && (
            <button
              type="button"
              onClick={() => void claimReward()}
              disabled={busy}
              className="min-h-11 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-5 py-3 text-xs font-black uppercase tracking-wide text-emerald-300 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
            >
              {busy ? t("game2048.claiming") : t("game2048.claim")}
            </button>
          )}
        </div>

        {cdSec > 0 && !session && (
          <p className="mt-3 text-center text-sm text-amber-400">
            {t("game2048.errors.COOLDOWN_ACTIVE")} ({cdSec}s)
          </p>
        )}

        {session && board && (
          <div
            role="grid"
            aria-label={t("game2048.grid_aria")}
            className="relative mx-auto mt-4 aspect-square w-full max-w-[min(100vw-2rem,420px)] touch-none rounded-2xl border border-slate-800/90 bg-[#050810] p-1.5 shadow-inner ring-1 ring-white/[0.04] sm:p-2"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="grid h-full w-full grid-cols-8 grid-rows-8 gap-1 sm:gap-1.5">
              {board.map((row, ri) =>
                row.map((value, ci) => (
                  <Chain2048Tile key={`cell-${ri}-${ci}`} value={value} row={ri} col={ci} t={t} />
                )),
              )}
            </div>
            {session.gameOver && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#03050a]/88 p-4 text-center backdrop-blur-[2px]">
                <p className="text-base font-black uppercase leading-tight text-white sm:text-lg">
                  {overlayKind === "won" && t("game2048.you_won")}
                  {overlayKind === "time" && t("game2048.time_up")}
                  {overlayKind === "closed" && t("game2048.round_closed")}
                  {overlayKind === "lost" && t("game2048.game_over")}
                </p>
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-center text-[11px] text-slate-600">{t("game2048.play_hint")}</p>
        {busy && <p className="text-center text-[11px] text-slate-600">{t("game2048.syncing")}</p>}
      </div>
    </div>
  );
}
