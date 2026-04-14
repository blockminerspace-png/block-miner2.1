import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, Coins, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../store/auth";
import {
  CRYPTO_ICONS,
  COIN_COLORS,
  cryptoSlugFor2048Tile,
  mergePathValues,
} from "../games/cryptoGameIcons.js";

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

function mergeProgressPercent(bestTile, winTile) {
  if (!winTile || winTile < 2) return 0;
  if (!bestTile || bestTile < 2) return 0;
  if (bestTile >= winTile) return 100;
  const num = Math.log2(bestTile);
  const den = Math.log2(winTile);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return Math.min(100, Math.max(0, (num / den) * 100));
}

function Chain2048Tile({ value, row, col, t }) {
  const slug = value > 0 ? cryptoSlugFor2048Tile(value) : null;
  const scheme = slug ? COIN_COLORS[slug] || COIN_COLORS.ethereum : null;
  const iconSrc = slug ? CRYPTO_ICONS[slug] || CRYPTO_ICONS.ethereum : null;
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    setImgOk(true);
  }, [value, slug]);

  return (
    <div
      className="relative flex aspect-square items-center justify-center overflow-hidden rounded border border-sky-500/35 bg-[#0a1628] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={value === 0 ? { background: "#0c1929" } : undefined}
    >
      <AnimatePresence mode="popLayout">
        {value > 0 && scheme ? (
          <motion.div
            key={`${row}-${col}-${value}`}
            initial={{ scale: 0.88, opacity: 0.75 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.82, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="relative flex h-[78%] w-[78%] items-center justify-center overflow-hidden rounded-full shadow-inner"
            style={{
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: scheme.border,
              background: `radial-gradient(circle at 30% 25%, ${scheme.bg}, rgba(6,10,18,0.95))`,
              boxShadow: `0 0 14px -4px ${scheme.glow}`,
            }}
            aria-label={t("game2048.tile_aria", { row: row + 1, col: col + 1, value })}
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
                {value}
              </span>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MergeLadder({ winTile, bestTile, t }) {
  const steps = useMemo(() => mergePathValues(winTile, 14), [winTile]);
  return (
    <aside
      className="flex w-[52px] shrink-0 flex-col gap-1.5 border-l border-sky-500/20 pl-2 sm:w-[60px]"
      aria-label={t("game2048.merge_path_aria")}
    >
      {steps.map((tileVal, i) => {
        const slug = cryptoSlugFor2048Tile(tileVal);
        const src = CRYPTO_ICONS[slug];
        const active = bestTile >= tileVal;
        return (
          <div
            key={`${tileVal}-${i}`}
            className={`flex aspect-square items-center justify-center rounded border p-0.5 transition-colors ${
              active
                ? "border-amber-400/70 bg-amber-500/15 ring-1 ring-amber-400/40"
                : "border-sky-600/25 bg-[#0a1628]/80 opacity-70"
            }`}
            title={`${tileVal}`}
          >
            {src ? (
              <img src={src} alt="" className="h-[72%] w-[72%] object-contain" draggable={false} />
            ) : (
              <span className="text-[8px] font-bold text-slate-500">{tileVal}</span>
            )}
          </div>
        );
      })}
    </aside>
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

  const winTile = session?.winTile ?? status?.winTile ?? 2048;
  const minScore = session?.minScore ?? status?.minScore ?? 1000;
  const rewardHr = session?.rewardHashRate ?? status?.rewardHashRate ?? 25;
  const powerDays = status?.powerDays ?? 7;
  const cdSec = status?.cooldownSecondsRemaining ?? 0;
  const canStartNew = Boolean(status?.allowNewStart) && (!session || session.status !== "ACTIVE");
  const board = session?.board;
  const best = board ? Math.max(...board.flat()) : 0;
  const cooldownMinutesDisplay = status?.cooldownMinutesHint || 3;
  const displaySeconds = roundSeconds ?? session?.secondsRemaining ?? 0;
  const showTimer = (session?.timeLimitSeconds ?? 0) > 0 && session?.status === "ACTIVE" && !session?.gameOver;
  const overlayKind = session ? endOverlayKey(session) : null;
  const progressPct = mergeProgressPercent(best, winTile);

  const boardSize = board?.length || 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#020617]" style={{ direction: "ltr" }}>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">{t("game2048.loading")}</div>
      ) : (
        <>
          <span className="sr-only">{t("game2048.title")}</span>
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#050a14] px-2 py-2 sm:px-4">
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
                    {session?.score ?? 0}
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-2 border-b border-slate-800/80 bg-[#050a14]/90 px-3 py-2 sm:px-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-sky-400/90">
                  {t("game2048.progress_label")}
                </span>
                <span className="text-[9px] font-bold tabular-nums text-slate-500">
                  {Math.round(progressPct)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800 ring-1 ring-sky-900/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[10px] leading-snug text-slate-500 sm:text-[11px]">
                {t("game2048.target_hint", { tile: winTile, minScore })} · {t("game2048.best_tile")}:{" "}
                <span className="font-bold text-sky-400">{best}</span>
              </p>
              <p className="text-[10px] text-slate-500 sm:text-[11px]">{t("game2048.reward_line", { hr: rewardHr, days: powerDays })}</p>
              {cooldownMinutesDisplay > 0 && (
                <p className="text-[10px] text-slate-600 sm:text-[11px]">
                  {t("game2048.cooldown_line", { minutes: cooldownMinutesDisplay })}
                </p>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-3">
              <div className="flex flex-wrap justify-center gap-2">
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
                <p className="text-center text-sm text-amber-400">
                  {t("game2048.errors.COOLDOWN_ACTIVE")} ({cdSec}s)
                </p>
              )}

              {session && board && boardSize > 0 && (
                <div className="mx-auto grid w-full max-w-[min(492px,calc(100vw-1.25rem))] grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:max-w-[min(500px,calc(100vw-1.5rem))]">
                  <div className="flex min-w-0 justify-center">
                    <div
                      role="grid"
                      aria-label={t("game2048.grid_aria")}
                      className="relative aspect-square w-full max-w-[420px] touch-none overflow-hidden rounded-xl border border-sky-600/30 bg-[#060d18] p-2 shadow-[inset_0_0_24px_rgba(0,0,0,0.45)]"
                      onTouchStart={onTouchStart}
                      onTouchEnd={onTouchEnd}
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
                  </div>
                  <MergeLadder winTile={winTile} bestTile={best} t={t} />
                </div>
              )}

              <p className="text-center text-[11px] text-slate-600">{t("game2048.play_hint")}</p>
              {busy && <p className="text-center text-[11px] text-slate-600">{t("game2048.syncing")}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
