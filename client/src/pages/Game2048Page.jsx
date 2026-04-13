import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api } from "../store/auth";
import { CRYPTO_ICONS, COIN_COLORS, cryptoSlugFor2048Tile } from "../games/cryptoGameIcons.js";

/** Hero headline: highlights trailing "2048" when it is the game token (not i18n key substrings like "game2048"). */
function Game2048Headline({ t }) {
  const full = t("game2048.title");
  const m = full.match(/^(.*?)(\s?2048)$/i);
  if (!m) {
    return <span className="text-white">{full}</span>;
  }
  return (
    <>
      <span className="text-white">{m[1]}</span>
      <span className="text-primary">{m[2]}</span>
    </>
  );
}

/** Decorative strip — same asset set as crypto-memory / match-3 (Games.jsx). */
const HERO_STRIP_SLUGS = ["bitcoin", "ethereum", "solana", "polygon"];

function Chain2048Tile({ value, row, col, t }) {
  const slug = value > 0 ? cryptoSlugFor2048Tile(value) : null;
  const scheme = slug ? COIN_COLORS[slug] || COIN_COLORS.polygon : null;
  const iconSrc = slug ? CRYPTO_ICONS[slug] || CRYPTO_ICONS.polygon : null;

  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-slate-800/50 ring-1 ring-inset ring-slate-700/40">
      <AnimatePresence mode="popLayout">
        {value > 0 && scheme && iconSrc ? (
          <motion.div
            layout
            key={`${row}-${col}-${value}`}
            initial={{ scale: 0.88, opacity: 0.75 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.82, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="relative flex h-[92%] w-[92%] flex-col items-center justify-center overflow-hidden rounded-lg shadow-inner"
            style={{
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: scheme.border,
              background: `linear-gradient(155deg, ${scheme.bg}, rgba(15,23,42,0.92))`,
              boxShadow: `0 0 18px -4px ${scheme.glow}`,
            }}
            aria-label={t("game2048.tile_aria", { row: row + 1, col: col + 1, value })}
          >
            <img
              src={iconSrc}
              alt=""
              className="pointer-events-none absolute left-1/2 top-[18%] h-[48%] w-[48%] -translate-x-1/2 object-contain opacity-[0.42]"
              draggable={false}
            />
            <span className="relative z-[1] mt-auto mb-[8%] text-[clamp(0.65rem,4.2vw,1.25rem)] font-black tabular-nums tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
              {value}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
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

  const sendMove = useCallback(
    async (direction) => {
      if (!session?.id || busy) return;
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
      if (!session || session.status !== "ACTIVE" || busy) return;
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
    [session, busy, sendMove],
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
    if (!start || !session || session.status !== "ACTIVE" || busy) return;
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

  return (
    <div
      className="mx-auto max-w-3xl animate-in space-y-8 pb-20 fade-in duration-1000"
      style={{ direction: "ltr" }}
    >
      <div className="flex flex-col gap-5 rounded-[2rem] border border-slate-800 bg-slate-900/50 p-5 shadow-xl sm:p-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <Link
            to="/games"
            className="mb-3 inline-flex min-h-10 items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("game2048.back_arena")}
          </Link>
          <h1 className="text-3xl font-black uppercase italic leading-none tracking-tighter text-white sm:text-4xl">
            <Game2048Headline t={t} />
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">{t("game2048.subtitle")}</p>
        </div>
        <div
          className="flex shrink-0 flex-row flex-wrap items-center gap-2 sm:gap-3 lg:flex-col lg:items-end"
          aria-label={t("game2048.crypto_strip_aria")}
        >
          {HERO_STRIP_SLUGS.map((slug) => (
            <div
              key={slug}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-950/90 p-2 shadow-lg ring-1 ring-white/5"
            >
              <img src={CRYPTO_ICONS[slug]} alt="" className="h-10 w-10 object-contain sm:h-11 sm:w-11" draggable={false} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-[2rem] border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t("game2048.score")}</p>
          <p className="text-2xl font-black tabular-nums text-white">{session?.score ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t("game2048.best_tile")}</p>
          <p className="text-2xl font-black tabular-nums text-primary">{best}</p>
        </div>
        <div className="col-span-2 text-xs text-slate-500">
          {t("game2048.target_hint", { tile: winTile, minScore })}
        </div>
        <div className="col-span-2 text-xs text-slate-400">
          {t("game2048.reward_line", { hr: rewardHr, days: powerDays })}
        </div>
        {cooldownMinutesDisplay > 0 && (
          <div className="col-span-2 text-xs text-slate-500">
            {t("game2048.cooldown_line", { minutes: cooldownMinutesDisplay })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canStartNew && (
          <button
            type="button"
            onClick={() => void startGame()}
            disabled={busy || !status?.allowNewStart}
            className="min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-primary/25 transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {t("game2048.new_game")}
          </button>
        )}
        {session?.canClaim && (
          <button
            type="button"
            onClick={() => void claimReward()}
            disabled={busy}
            className="min-h-11 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-5 py-3 text-sm font-black uppercase tracking-wide text-emerald-300 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
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

      {session && board && (
        <div
          role="grid"
          aria-label={t("game2048.grid_aria")}
          className="relative mx-auto aspect-square w-full max-w-[min(100vw-2rem,420px)] touch-none rounded-[2rem] border border-slate-800 bg-slate-950/85 p-2 shadow-2xl ring-1 ring-white/5 sm:p-3"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-1.5 sm:gap-2">
            {board.map((row, ri) =>
              row.map((value, ci) => (
                <Chain2048Tile key={`cell-${ri}-${ci}`} value={value} row={ri} col={ci} t={t} />
              )),
            )}
          </div>
          {session.gameOver && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-slate-950/80 p-4 text-center backdrop-blur-[2px]">
              <p className="text-lg font-black uppercase text-white">
                {session.won ? t("game2048.you_won") : t("game2048.game_over")}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-slate-500">{t("game2048.play_hint")}</p>

      {busy && <p className="text-center text-xs text-slate-500">{t("game2048.syncing")}</p>}
    </div>
  );
}
