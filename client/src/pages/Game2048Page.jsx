import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft, Clock, Coins, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../store/auth";
import { CRYPTO_ICONS, COIN_COLORS, cryptoSlugFor2048Tile } from "../games/cryptoGameIcons.js";

function formatMmSs(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

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
  const reduceMotion = useReducedMotion();
  const num = typeof value === "number" ? value : Number(value);
  const hasTile = Number.isFinite(num) && num > 0;
  const slug = hasTile ? cryptoSlugFor2048Tile(num) : null;
  const scheme = slug ? COIN_COLORS[slug] || COIN_COLORS.ethereum : null;
  const iconSrc = slug ? CRYPTO_ICONS[slug] || CRYPTO_ICONS.ethereum : null;
  const [imgOk, setImgOk] = useState(true);
  const tileTransition = reduceMotion
    ? { duration: 0.12 }
    : { type: "spring", stiffness: 420, damping: 28 };

  useEffect(() => {
    setImgOk(true);
  }, [value, slug]);

  return (
    <div
      className="relative flex aspect-square items-center justify-center overflow-hidden rounded border border-sky-500/35 bg-[#0a1628] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={!hasTile ? { background: "#0c1929" } : undefined}
    >
      <AnimatePresence mode="popLayout">
        {hasTile && scheme ? (
          <motion.div
            key={`${row}-${col}-${num}`}
            initial={reduceMotion ? { opacity: 0.9 } : { scale: 0.88, opacity: 0.75 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.82, opacity: 0 }}
            transition={tileTransition}
            className="relative flex h-[78%] w-[78%] items-center justify-center overflow-hidden rounded-full shadow-inner"
            style={{
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: scheme.border,
              background: `radial-gradient(circle at 30% 25%, ${scheme.bg}, rgba(6,10,18,0.95))`,
              boxShadow: `0 0 14px -4px ${scheme.glow}`,
            }}
            aria-label={t("game2048.tile_aria", { row: row + 1, col: col + 1, value: num })}
          >
            {iconSrc && imgOk ? (
              <img
                src={iconSrc}
                alt=""
                className="pointer-events-none h-[62%] w-[62%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                draggable={false}
                onError={() => setImgOk(false)}
              />
            ) : (
              <span className="select-none font-mono text-[clamp(10px,3.5vmin,18px)] font-black tabular-nums text-white/90">
                {num}
              </span>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Game2048BoardSkeleton({ t, labelKey }) {
  const n = 4;
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={t(labelKey)}
      className="relative aspect-square w-full max-w-[min(420px,min(calc(100dvw-1.5rem),calc(100vw-1.5rem)))] animate-pulse touch-none overflow-hidden rounded-xl border border-sky-600/25 bg-[#060d18] p-1.5 shadow-[inset_0_0_24px_rgba(0,0,0,0.45)] sm:p-2 sm:max-w-[420px]"
    >
      <div
        className="grid h-full w-full gap-1.5 sm:gap-2"
        style={{
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: n * n }, (_, i) => (
          <div
            key={`sk-${i}`}
            className="rounded border border-sky-800/35 bg-[#0c1929]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          />
        ))}
      </div>
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
  /** Touch / pen swipe tracking (pointer id + capture — fixes iOS lost touchend). */
  const pointerSwipeRef = useRef(null);
  const boardGridRef = useRef(null);
  const timeoutRefreshRef = useRef(false);
  const autoStartInFlightRef = useRef(false);

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

  const startGame = useCallback(async ({ silent = false } = {}) => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/2048/start");
      if (!data?.ok) {
        if (!silent && data?.code === "COOLDOWN_ACTIVE") {
          toast.error(t("game2048.errors.COOLDOWN_ACTIVE"));
        } else if (!silent) {
          toast.error(t("game2048.errors.start_failed"));
        }
        await refreshStatus();
        return { ok: false, code: data?.code || "START_FAILED" };
      }
      if (data.session) setSession(data.session);
      await refreshStatus();
      return { ok: true };
    } catch {
      if (!silent) toast.error(t("game2048.errors.start_failed"));
      return { ok: false, code: "START_FAILED" };
    } finally {
      setBusy(false);
    }
  }, [t, refreshStatus]);

  useEffect(() => {
    if (loading) return;
    if (!status || status.ok === false) return;
    if (session?.status === "ACTIVE" && !session?.gameOver) return;
    if (!status.allowNewStart || (status.cooldownSecondsRemaining ?? 0) > 0) return;
    if (busy || autoStartInFlightRef.current) return;

    autoStartInFlightRef.current = true;
    void startGame({ silent: true }).finally(() => {
      autoStartInFlightRef.current = false;
    });
  }, [loading, status, session, busy, startGame]);

  useEffect(() => {
    return () => {
      autoStartInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sessionBoardSize = Array.isArray(session?.board) ? session.board.length : 0;
    const sessionHasBoard = sessionBoardSize > 0;
    if (!loading && !sessionHasBoard && !busy && status?.allowNewStart && (status?.cooldownSecondsRemaining ?? 0) === 0) {
      // Keep trying to bootstrap an initial board if the first auto-start race fails.
      const retryId = setTimeout(() => {
        if (!autoStartInFlightRef.current) {
          autoStartInFlightRef.current = true;
          void startGame({ silent: true }).finally(() => {
            autoStartInFlightRef.current = false;
          });
        }
      }, 1200);
      return () => clearTimeout(retryId);
    }
    return undefined;
  }, [loading, session, busy, status, startGame]);

  const roundSeconds = useRoundSecondsRemaining(session);

  /** Prefer the smaller of client tick and server snapshot so the timer never runs ahead of the authority clock. */
  const displaySeconds = useMemo(() => {
    const limit = session?.timeLimitSeconds ?? 0;
    if (limit <= 0) return 0;
    const server = session?.secondsRemaining;
    if (typeof server === "number" && roundSeconds != null) {
      return Math.max(0, Math.min(server, roundSeconds));
    }
    if (roundSeconds != null) return roundSeconds;
    if (typeof server === "number") return Math.max(0, server);
    return 0;
  }, [session?.timeLimitSeconds, session?.secondsRemaining, roundSeconds]);

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
    [session, busy, t],
  );

  const onKeyDown = useCallback(
    (e) => {
      const key = e.key;
      const isArrow = key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
      if (!isArrow) return;
      const el = e.target;
      const tag = el && typeof el.tagName === "string" ? el.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      e.preventDefault();
      e.stopPropagation();
      if (!session || session.status !== "ACTIVE" || session.gameOver || busy) return;
      let dir = null;
      if (key === "ArrowUp") dir = "up";
      else if (key === "ArrowDown") dir = "down";
      else if (key === "ArrowLeft") dir = "left";
      else if (key === "ArrowRight") dir = "right";
      if (!dir) return;
      void sendMove(dir);
    },
    [session, busy, sendMove],
  );

  useEffect(() => {
    const opts = { capture: true, passive: false };
    window.addEventListener("keydown", onKeyDown, opts);
    return () => window.removeEventListener("keydown", onKeyDown, opts);
  }, [onKeyDown]);

  /** Lock document scroll so arrow keys do not scroll the page or nested overflow regions. */
  useEffect(() => {
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const restartGame = useCallback(async () => {
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
  }, [t, refreshStatus]);

  const claimReward = useCallback(async () => {
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
        if (data.rewardPowerHours != null && Number(data.rewardPowerHours) > 0) {
          toast.success(
            t("game2048.claimed_toast_hours", {
              hr: data.rewardHashRate,
              hours: data.rewardPowerHours,
            }),
          );
        } else {
          toast.success(
            t("game2048.claimed_toast", {
              hr: data.rewardHashRate,
              days: data.rewardPowerDays ?? data.powerDays,
            }),
          );
        }
      }
      await refreshStatus();
    } catch {
      toast.error(t("game2048.errors.claim_failed"));
    } finally {
      setBusy(false);
    }
  }, [session, busy, t, refreshStatus]);

  const minSwipePx = useMemo(() => {
    if (typeof window === "undefined") return 32;
    return Math.round(Math.max(28, Math.min(52, window.innerWidth * 0.07)));
  }, []);

  const onBoardPointerDown = useCallback(
    (e) => {
      if (busy) return;
      if (!session || session.status !== "ACTIVE" || session.gameOver) return;
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      pointerSwipeRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers reject capture on non-interactive stacking; swipe still works if finger stays on grid.
      }
    },
    [session, busy],
  );

  const clearPointerSwipe = useCallback((target, pointerId) => {
    pointerSwipeRef.current = null;
    try {
      if (target && typeof target.hasPointerCapture === "function" && target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  }, []);

  const onBoardPointerUp = useCallback(
    (e) => {
      const start = pointerSwipeRef.current;
      if (!start || start.id !== e.pointerId) return;
      clearPointerSwipe(e.currentTarget, e.pointerId);

      if (!session || session.status !== "ACTIVE" || session.gameOver || busy) return;
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < minSwipePx) return;
      if (ax > ay) void sendMove(dx > 0 ? "right" : "left");
      else void sendMove(dy > 0 ? "down" : "up");
    },
    [session, busy, sendMove, minSwipePx, clearPointerSwipe],
  );

  const onBoardPointerCancel = useCallback(
    (e) => {
      if (pointerSwipeRef.current?.id === e.pointerId) {
        clearPointerSwipe(e.currentTarget, e.pointerId);
      }
    },
    [clearPointerSwipe],
  );

  const onBoardLostPointerCapture = useCallback(
    (e) => {
      if (pointerSwipeRef.current?.id === e.pointerId) {
        pointerSwipeRef.current = null;
      }
    },
    [],
  );

  const cdSec = status?.cooldownSecondsRemaining ?? 0;
  const board = session?.board;
  const showTimer = (session?.timeLimitSeconds ?? 0) > 0 && session?.status === "ACTIVE" && !session?.gameOver;
  const overlayKind = session ? endOverlayKey(session) : null;

  const boardSize = board?.length || 0;
  const hasBoard = Boolean(board && boardSize > 0);

  useEffect(() => {
    const el = boardGridRef.current;
    if (!el || !hasBoard) return undefined;
    const blockNativeScroll = (ev) => {
      if (ev.cancelable) ev.preventDefault();
    };
    el.addEventListener("touchmove", blockNativeScroll, { passive: false });
    return () => el.removeEventListener("touchmove", blockNativeScroll);
  }, [hasBoard]);

  const skeletonLabelKey = loading
    ? "game2048.grid_loading_aria"
    : busy
      ? "game2048.starting"
      : "game2048.grid_placeholder_aria";

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] touch-manipulation flex-col overflow-hidden bg-[#020617] pt-[env(safe-area-inset-top)]"
      style={{ direction: "ltr", overscrollBehavior: "none" }}
    >
      <>
        <span className="sr-only">{t("game2048.title")}</span>
        {loading && (
          <span className="sr-only" aria-live="polite">
            {t("game2048.loading")}
          </span>
        )}
        <header className="flex shrink-0 items-center justify-between gap-1.5 border-b border-slate-800 bg-[#050a14] px-2 py-2 sm:gap-2 sm:px-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                to="/games"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/60 text-slate-400 transition-colors hover:border-sky-500/40 hover:text-sky-400"
                aria-label={t("game2048.back_arena")}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 sm:px-3">
                <Coins className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-200/80">
                    {t("game2048.score")}
                  </span>
                  <span className="text-lg font-black tabular-nums leading-none text-amber-50 sm:text-xl">
                    {Number(session?.score) || 0}
                  </span>
                </div>
              </div>
            </div>
            <h1 className="pointer-events-none shrink-0 text-center text-[10px] font-black uppercase italic tracking-tight text-white sm:text-xs">
              <span className="bg-gradient-to-b from-sky-300 via-blue-400 to-indigo-600 bg-clip-text text-transparent">
                {t("game2048.brand")}
              </span>
              <span className="sr-only">{t("game2048.brand_aria")}</span>
            </h1>
            <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
              {(showTimer || (session?.timeLimitSeconds ?? 0) > 0) && (
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-widest text-slate-500 sm:text-[9px]">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    {t("game2048.time")}
                  </p>
                  <p className="font-mono text-lg font-black tabular-nums leading-none text-sky-300 sm:text-xl">
                    {showTimer ? formatMmSs(displaySeconds) : formatMmSs(0)}
                  </p>
                </div>
              )}
              {session?.status === "ACTIVE" && !session?.gameOver && (
                <button
                  type="button"
                  onClick={() => void restartGame()}
                  disabled={busy}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/20 text-red-400 transition-all hover:bg-red-500/40 disabled:opacity-40"
                  aria-label={t("game2048.reset_aria")}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-none">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden overscroll-none px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-4">
              <div className="flex flex-wrap justify-center gap-2">
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
                <p className="text-center text-sm text-amber-400">
                  {t("game2048.errors.COOLDOWN_ACTIVE")} ({cdSec}s)
                </p>
              )}

              <div className="mx-auto flex w-full max-w-[min(420px,min(calc(100dvw-1rem),calc(100vw-1rem)))] flex-col items-center sm:max-w-[420px]">
                <div className="flex w-full min-w-0 justify-center">
                  {hasBoard ? (
                    <div
                      ref={boardGridRef}
                      role="grid"
                      aria-label={t("game2048.grid_aria")}
                      className="relative aspect-square w-full max-w-full touch-none select-none overflow-hidden rounded-xl border border-sky-600/30 bg-[#060d18] p-1.5 shadow-[inset_0_0_24px_rgba(0,0,0,0.45)] sm:p-2"
                      style={{ touchAction: "none" }}
                      onPointerDown={onBoardPointerDown}
                      onPointerUp={onBoardPointerUp}
                      onPointerCancel={onBoardPointerCancel}
                      onLostPointerCapture={onBoardLostPointerCapture}
                    >
                      <div
                        className="grid h-full w-full gap-1.5 sm:gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                          gridTemplateRows: `repeat(${boardSize}, minmax(0, 1fr))`,
                        }}
                      >
                        {board.map((row, ri) =>
                          row.map((value, ci) => (
                            <Chain2048Tile key={`cell-${ri}-${ci}`} value={value} row={ri} col={ci} t={t} />
                          )),
                        )}
                      </div>
                      {session.gameOver && (
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-[#03050a]/88 p-4 text-center backdrop-blur-[2px]">
                          <p className="text-base font-black uppercase leading-tight text-white sm:text-lg">
                            {overlayKind === "won" && t("game2048.you_won")}
                            {overlayKind === "time" && t("game2048.time_up")}
                            {overlayKind === "closed" && t("game2048.round_closed")}
                            {overlayKind === "lost" && t("game2048.game_over")}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Game2048BoardSkeleton t={t} labelKey={skeletonLabelKey} />
                  )}
                </div>
              </div>

              {busy && (
                <p className="text-center text-[11px] text-slate-600">
                  {hasBoard ? t("game2048.syncing") : t("game2048.starting")}
                </p>
              )}
            </div>
        </div>
      </>
    </div>
  );
}
