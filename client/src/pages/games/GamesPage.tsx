import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, memo } from "react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import { useAuthStore, api } from "../../store/auth";
import { formatHashrate } from "../../shared/utils/machine";
import { Link, useNavigate } from "react-router-dom";
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Grid3X3, Car, Layers, Plane, Gamepad2 } from "lucide-react";
import PartnerGamesTab from "./PartnerGamesTab";
import { getGameCooldownSeconds } from "../../games/gameCooldownStore";

export default function Games() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [gamesTab, setGamesTab] = useState<"ours" | "partners">("ours");

  const [totalGamePower, setTotalGamePower] = useState(0);
  const [powerLoading, setPowerLoading] = useState(true);
  const [powerError, setPowerError] = useState<string | null>(null);
  const [powerFlash, setPowerFlash] = useState(false);
  const prevGamePowerRef = useRef<number | null>(null);

  const [chain2048CdSec, setChain2048CdSec] = useState(0);
  const [chain2048AllowStart, setChain2048AllowStart] = useState(true);
  const [chain2048HasActiveSession, setChain2048HasActiveSession] = useState(false);

  const [cooldownTick, setCooldownTick] = useState(0);
  void cooldownTick;

  useEffect(() => {
    const id = setInterval(() => setCooldownTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const memoryCooldown = getGameCooldownSeconds("memory");
  const match3Cooldown = getGameCooldownSeconds("match-3");
  const cartCooldown = getGameCooldownSeconds("cart");
  const stackCooldown = getGameCooldownSeconds("stack");
  const skyCooldown = getGameCooldownSeconds("sky");

  const fetchActiveGamePowers = useCallback(async (options: { silent?: boolean } = {}) => {
    const silent = Boolean(options.silent);
    try {
      if (!silent) setPowerLoading(true);
      setPowerError(null);
      const res = await api.get("/games/active-powers");
      if (res.data?.ok) {
        const next = Number(res.data.totalHashRate) || 0;
        if (prevGamePowerRef.current !== null && next !== prevGamePowerRef.current) {
          setPowerFlash(true);
          setTimeout(() => setPowerFlash(false), 800);
        }
        prevGamePowerRef.current = next;
        setTotalGamePower(next);
      } else {
        setPowerError("load_failed");
      }
    } catch {
      setPowerError("load_failed");
    } finally {
      if (!silent) setPowerLoading(false);
    }
  }, []);

  useEffect(() => { void fetchActiveGamePowers({ silent: false }); }, [fetchActiveGamePowers]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") void fetchActiveGamePowers({ silent: true }); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchActiveGamePowers]);
  useEffect(() => {
    const id = setInterval(() => void fetchActiveGamePowers({ silent: true }), 50000);
    return () => clearInterval(id);
  }, [fetchActiveGamePowers]);

  const fetchChain2048Arena = useCallback(async () => {
    try {
      const res = await api.get("/games/2048/status");
      if (res.data?.ok) {
        setChain2048CdSec(Math.max(0, Number(res.data.cooldownSecondsRemaining) || 0));
        setChain2048AllowStart(Boolean(res.data.allowNewStart));
        setChain2048HasActiveSession(Boolean(res.data.activeSession));
      }
    } catch { /* leave previous values */ }
  }, []);

  useEffect(() => {
    void fetchChain2048Arena();
    const id = setInterval(() => void fetchChain2048Arena(), 8000);
    return () => clearInterval(id);
  }, [fetchChain2048Arena]);

  const chain2048CardBlocked = chain2048CdSec > 0 || (!chain2048AllowStart && !chain2048HasActiveSession);

  return (
    <div className="animate-in fade-in space-y-8 duration-1000" style={{ direction: "ltr" }}>
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/50 p-4 shadow-xl sm:p-6 lg:flex-row lg:items-stretch lg:justify-between">
        <h1 className="min-w-0 shrink-0 text-3xl font-black uppercase italic leading-none tracking-tight text-white sm:text-4xl">
          {t("minerGames.brand_prefix")}
          <span className="text-primary">{t("minerGames.brand_suffix")}</span>
        </h1>
        <TemporaryPowerSummary
          t={t}
          totalGamePower={totalGamePower}
          loading={powerLoading}
          errorKey={powerError}
          flash={powerFlash}
          onRetry={() => void fetchActiveGamePowers({ silent: false })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setGamesTab("ours")}
          className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${
            gamesTab === "ours"
              ? "bg-primary text-white shadow-lg shadow-primary/30"
              : "border border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-white"
          }`}
        >
          <Zap className="h-4 w-4" />
          {t("minerGames.tabs.ours")}
        </button>
        <button
          type="button"
          onClick={() => setGamesTab("partners")}
          className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${
            gamesTab === "partners"
              ? "bg-primary text-white shadow-lg shadow-primary/30"
              : "border border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-white"
          }`}
        >
          <Gamepad2 className="h-4 w-4" />
          {t("minerGames.tabs.partners")}
        </button>
      </div>

      {gamesTab === "partners" ? (
        <PartnerGamesTab t={t} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
          <GameCard
            title={t("minerGames.memory_sync_title")}
            description={t("minerGames.memory_sync_desc")}
            icon={Brain}
            color="from-blue-600 to-indigo-700"
            onClick={() => navigate("/games/memory")}
            disabled={memoryCooldown > 0}
            ctaStart={t("minerGames.cta_start")}
            cooldownLabel={t("minerGames.cooldown_label", { seconds: memoryCooldown })}
          />
          <GameCard
            title={t("minerGames.power_match_title")}
            description={t("minerGames.power_match_desc")}
            icon={LayoutGrid}
            color="from-primary to-orange-700"
            onClick={() => navigate("/games/match-3")}
            disabled={match3Cooldown > 0}
            ctaStart={t("minerGames.cta_start")}
            cooldownLabel={t("minerGames.cooldown_label", { seconds: match3Cooldown })}
          />
          <GameCard
            title={t("minerGames.cart_rush_title")}
            description={t("minerGames.cart_rush_desc")}
            icon={Car}
            color="from-sky-500 to-blue-700"
            onClick={() => navigate("/games/cart")}
            disabled={cartCooldown > 0}
            ctaStart={t("minerGames.cta_start")}
            cooldownLabel={t("minerGames.cooldown_label", { seconds: cartCooldown })}
          />
          <GameCard
            title={t("minerGames.block_stack_title")}
            description={t("minerGames.block_stack_desc")}
            icon={Layers}
            color="from-amber-500 to-orange-700"
            onClick={() => navigate("/games/stack")}
            disabled={stackCooldown > 0}
            ctaStart={t("minerGames.cta_start")}
            cooldownLabel={t("minerGames.cooldown_label", { seconds: stackCooldown })}
          />
          <GameCard
            title={t("minerGames.sky_runner_title")}
            description={t("minerGames.sky_runner_desc")}
            icon={Plane}
            color="from-sky-400 to-cyan-700"
            onClick={() => navigate("/games/sky")}
            disabled={skyCooldown > 0}
            ctaStart={t("minerGames.cta_start")}
            cooldownLabel={t("minerGames.cooldown_label", { seconds: skyCooldown })}
          />
          <GameCardLink
            to="/games/2048"
            title={t("game2048.title")}
            description={t("game2048.card_desc")}
            icon={Grid3X3}
            color="from-emerald-600 to-teal-800"
            ctaLabel={t("game2048.open_game")}
            disabled={chain2048CardBlocked}
            cooldownMinutes={chain2048CdSec > 0 ? Math.max(1, Math.ceil(chain2048CdSec / 60)) : 0}
          />
        </div>
      )}
    </div>
  );
}

type TemporaryPowerSummaryProps = {
  t: TFunction;
  totalGamePower: number;
  loading: boolean;
  errorKey: string | null;
  flash: boolean;
  onRetry: () => void;
};

function TemporaryPowerSummary({ t, totalGamePower, loading, errorKey, flash, onRetry }: TemporaryPowerSummaryProps) {
  const tooltip = t("minerGames.temporary_power_tooltip");
  return (
    <div
      className={`min-w-0 flex-1 overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-amber-600/5 to-slate-900/40 px-3 py-3 shadow-lg transition-all duration-300 sm:max-w-md sm:px-4 lg:max-w-lg ${flash ? "ring-2 ring-amber-400/70 sm:scale-[1.01]" : ""}`}
      title={tooltip}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/25 text-amber-300 shadow-inner"
          aria-hidden
        >
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-wide text-amber-200/90 sm:tracking-[0.2em]">
            {t("games.temporary_power_label")}
          </p>
          {errorKey ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-red-400">{t("minerGames.power_error")}</span>
              <button
                type="button"
                onClick={onRetry}
                className="touch-manipulation rounded px-1 text-xs font-bold uppercase tracking-wider text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {t("minerGames.retry")}
              </button>
            </div>
          ) : (
            <>
              <p
                className="mt-0.5 text-xl font-black tabular-nums tracking-tight text-white sm:text-2xl"
                aria-live="polite"
                aria-label={`${t("games.temporary_power_label")}: ${loading ? t("minerGames.loading_power") : formatHashrate(totalGamePower)}`}
              >
                {loading ? t("minerGames.loading_power") : formatHashrate(totalGamePower)}
              </p>
              {!loading && totalGamePower <= 0 && (
                <p className="text-[10px] font-medium text-slate-500">{t("minerGames.no_active_bonus")}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type GameCardLinkProps = {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  ctaLabel: string;
  disabled?: boolean;
  cooldownMinutes?: number;
};

/**
 * BlockStackArena — DOM-rendered game surface for the "block-stack" minigame.
 *
 * The server is authoritative: it tells us blockWidth, the absolute leftPx of
 * the tower base, and the timestamps for animating the moving block locally.
 * We compute the block's current X position from (Date.now() - startedAt) using
 * the same ping-pong formula the server uses to validate drops, so the visual
 * stays in sync without sending intermediate positions over the wire.
 */
const BlockStackArena = memo(function BlockStackArena({
  state,
  onDrop,
  isGameOver,
  t,
}: {
  state:
    | {
        target: number;
        playWidth: number;
        blocksPlaced: number;
        block: { width: number; travelMs: number; startedAt: number };
        base: { leftPx: number; width: number };
        tower: Array<{ leftPx: number; width: number }>;
      }
    | null;
  onDrop: () => void;
  isGameOver: boolean;
  t: TFunction;
}) {
  const [blockLeftPx, setBlockLeftPx] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Drive the block animation locally from the server's startedAt + travelMs.
  useEffect(() => {
    if (!state || isGameOver) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.max(0, now - state.block.startedAt);
      const travel = Math.max(1, state.block.travelMs);
      const cyclePos = (elapsed % (travel * 2)) / travel;
      const phase = cyclePos <= 1 ? cyclePos : 2 - cyclePos;
      const maxLeft = state.playWidth - state.block.width;
      setBlockLeftPx(phase * maxLeft);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [state, isGameOver]);

  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-widest text-slate-500">
        {t("minerGames.loading")}
      </div>
    );
  }

  // Tower height: each block stacked grows upward from the bottom.
  const BLOCK_H = 22;
  const towerHeight = state.tower.length * BLOCK_H;
  const trackHeight = 360; // visual play height for the moving block area

  return (
    <div className="relative flex h-full w-full flex-col bg-gradient-to-b from-slate-900 to-black">
      {/* Progress bar */}
      <div className="px-3 pt-3">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span>{t("minerGames.block_stack.progress", { current: state.blocksPlaced, total: state.target })}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-200"
            style={{ width: `${(state.blocksPlaced / state.target) * 100}%` }}
          />
        </div>
      </div>

      {/* Play area — relative coords scaled to state.playWidth */}
      <div
        className="relative mx-auto mt-4 mb-2 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/80"
        style={{ width: state.playWidth, maxWidth: "100%", height: trackHeight }}
      >
        {/* Moving block */}
        <div
          className="absolute h-[22px] rounded-md bg-gradient-to-r from-amber-300 to-orange-500 shadow-lg"
          style={{
            top: 8,
            left: blockLeftPx,
            width: state.block.width,
            transform: "translateZ(0)", // GPU-accel; smooth motion
          }}
        />
        {/* Stacked tower (built bottom-up) */}
        {state.tower.map((b, idx) => (
          <div
            key={idx}
            className="absolute h-[22px] rounded-sm bg-gradient-to-r from-emerald-400 to-cyan-500 shadow"
            style={{
              left: b.leftPx,
              width: b.width,
              bottom: idx * BLOCK_H,
            }}
          />
        ))}
        {/* Aim guide on the next-base position */}
        <div
          className="absolute border-x-2 border-dashed border-emerald-400/30"
          style={{
            left: state.base.leftPx,
            width: state.base.width,
            top: 8,
            bottom: towerHeight,
          }}
        />
      </div>

      {/* Drop button */}
      <button
        type="button"
        onClick={onDrop}
        disabled={isGameOver}
        className="mx-auto mb-4 mt-auto rounded-2xl bg-primary px-8 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("minerGames.block_stack.drop_button")}
      </button>
    </div>
  );
});

/**
 * SkyRunnerArena — Flappy-Bird-style minigame, **100% client-side physics**.
 *
 * Architecture:
 *   - Server emits `game:started` with a seed + physics constants. After
 *     that, the client owns the simulation: gravity, scroll, pipe spawning
 *     and collision detection all run in a rAF loop. Inputs (flap on
 *     Space/ArrowUp/W/Tap/Click) take effect on the very next frame — zero
 *     input delay.
 *   - Pipes are generated by a deterministic PRNG (mulberry32) seeded from
 *     the server's hex seed, so two clients with the same seed would see
 *     the same pipe layout.
 *   - Every `checkpointEveryPipes`, we report `{pipesPassed, elapsedMs}` to
 *     the server. Server compares against the minimum theoretical pace and
 *     can drop the session if the client is faking progress.
 *   - On win/loss we emit `{type:"finish",...}` so the server runs the
 *     existing `finishGame()` (15s minimum playtime floor, reward grant).
 */

/** Hex string → 32-bit seed integer (xor-fold 8 hex chars at a time). */
function skySeedFromHex(hex: string): number {
  let s = 0;
  const clean = (hex || "").replace(/[^0-9a-f]/gi, "");
  for (let i = 0; i < clean.length; i += 8) {
    const chunk = clean.slice(i, i + 8);
    if (chunk.length === 0) break;
    s = (s ^ parseInt(chunk, 16)) >>> 0;
  }
  return s || 0x9e3779b9;
}

/** mulberry32 — tiny deterministic PRNG returning floats in [0,1). */
function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SkyPipe = {
  id: number;
  x: number;
  gapTop: number;
  gapBottom: number;
  passed: boolean;
};

type SkyConfig = {
  seed: string;
  worldW: number;
  worldH: number;
  planeX: number;
  planeRadius: number;
  pipeW: number;
  pipeGap: number;
  pipeGapMin: number;
  pipeSpawnDx: number;
  pipeMargin: number;
  scrollSpeedBase: number;
  scrollSpeedMax: number;
  difficultyRampMs: number;
  gravity: number;
  flapVy: number;
  maxVy: number;
  minFlapIntervalMs: number;
  invulnMs: number;
  targetPipes: number;
  lives: number;
  maxLives: number;
  checkpointEveryPipes: number;
};

const SkyRunnerArena = memo(function SkyRunnerArena({
  state,
  onFlap,
  onCheckpoint,
  onFinish,
  isGameOver,
  t,
}: {
  state: SkyConfig | null;
  onFlap: () => void;
  onCheckpoint: (info: { pipesPassed: number; elapsedMs: number; lives: number; score: number }) => void;
  onFinish: (info: { pipesPassed: number; elapsedMs: number; score: number; won: boolean }) => void;
  isGameOver: boolean;
  t: TFunction;
}) {
  // ── Live physics state. Refs so the rAF loop can mutate without rerender.
  const physRef = useRef<{
    y: number;
    vy: number;
    pipes: SkyPipe[];
    pipeSeq: number;
    nextSpawnX: number;
    scrollSpeed: number;
    elapsedMs: number;
    lives: number;
    invulnUntil: number;
    pipesPassed: number;
    score: number;
    lastFlapAt: number;
    rng: () => number;
    lastFrameAt: number;
    crashed: string | null;
    finished: boolean;
  } | null>(null);

  // React-mirrored HUD (hearts + progress text). Re-rendered on changes only.
  const [hud, setHud] = useState<{
    lives: number;
    pipesPassed: number;
    invulnerable: boolean;
    crashed: string | null;
    hitFlashKey: number;
  }>({ lives: 0, pipesPassed: 0, invulnerable: false, crashed: null, hitFlashKey: 0 });

  // Reset physics on each new `state` (fresh game start).
  useEffect(() => {
    if (!state) {
      physRef.current = null;
      setHud({ lives: 0, pipesPassed: 0, invulnerable: false, crashed: null, hitFlashKey: 0 });
      return;
    }
    physRef.current = {
      y: state.worldH / 2,
      vy: 0,
      pipes: [],
      pipeSeq: 0,
      nextSpawnX: state.worldW + 200,
      scrollSpeed: state.scrollSpeedBase,
      elapsedMs: 0,
      lives: state.lives,
      invulnUntil: 0,
      pipesPassed: 0,
      score: 0,
      lastFlapAt: 0,
      rng: makeMulberry32(skySeedFromHex(state.seed)),
      lastFrameAt: 0,
      crashed: null,
      finished: false,
    };
    setHud({
      lives: state.lives,
      pipesPassed: 0,
      invulnerable: false,
      crashed: null,
      hitFlashKey: 0,
    });
  }, [state]);

  // ── Input: flap (Space/ArrowUp/W keyboard; tap/click via JSX onPointerDown)
  const flap = useCallback(() => {
    const ph = physRef.current;
    if (!ph || !state || ph.finished) return;
    const now = performance.now();
    if (now - ph.lastFlapAt < state.minFlapIntervalMs) return;
    ph.lastFlapAt = now;
    ph.vy = state.flapVy;
    onFlap();
  }, [state, onFlap]);

  const flapRef = useRef(flap);
  flapRef.current = flap;

  useEffect(() => {
    if (isGameOver) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = String(e.key || "").toLowerCase();
      const isSpace = k === " " || e.code === "Space" || k === "spacebar";
      const isUp = k === "arrowup" || k === "w";
      if (!isSpace && !isUp) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() || "";
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      e.preventDefault();
      flapRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isGameOver]);

  // DOM nodes managed by rAF
  const planeElRef = useRef<HTMLDivElement | null>(null);
  const pipesLayerRef = useRef<HTMLDivElement | null>(null);
  const pipeNodesRef = useRef<Map<number, { top: HTMLDivElement; bottom: HTMLDivElement }>>(new Map());
  const tiltSmoothedRef = useRef(0);
  const lastCheckpointReportedRef = useRef(0);

  // Stable callback refs so the rAF closure can call latest version
  const onCheckpointRef = useRef(onCheckpoint);
  onCheckpointRef.current = onCheckpoint;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const hitFlashKey = hud.hitFlashKey;

  // ── rAF loop: full physics + render at monitor refresh rate
  useEffect(() => {
    if (!state) return;
    let raf = 0;
    const worldW = state.worldW;
    const worldH = state.worldH;
    const planeXPct = (state.planeX / worldW) * 100;
    const planeWPct = ((state.planeRadius * 2) / worldW) * 100;
    const pipeWPct = (state.pipeW / worldW) * 100;

    // Wipe any old DOM nodes from a previous run
    for (const pair of pipeNodesRef.current.values()) {
      pair.top.remove();
      pair.bottom.remove();
    }
    pipeNodesRef.current.clear();
    lastCheckpointReportedRef.current = 0;

    /** Push a fresh pipe at nextSpawnX, then advance nextSpawnX by pipeSpawnDx. */
    const spawnPipe = () => {
      const ph = physRef.current;
      if (!ph) return;
      const ramp = Math.min(1, ph.elapsedMs / state.difficultyRampMs);
      const gap = state.pipeGap - (state.pipeGap - state.pipeGapMin) * ramp;
      const minCenter = state.pipeMargin + gap / 2;
      const maxCenter = state.worldH - state.pipeMargin - gap / 2;
      const center = minCenter + ph.rng() * Math.max(0, maxCenter - minCenter);
      ph.pipes.push({
        id: ++ph.pipeSeq,
        x: ph.nextSpawnX,
        gapTop: center - gap / 2,
        gapBottom: center + gap / 2,
        passed: false,
      });
      ph.nextSpawnX += state.pipeSpawnDx;
    };

    const tick = () => {
      const ph = physRef.current;
      if (!ph) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      const dt = ph.lastFrameAt === 0 ? 0 : Math.min(64, now - ph.lastFrameAt);
      ph.lastFrameAt = now;
      const dtSec = dt / 1000;

      if (!ph.finished && !ph.crashed) {
        ph.elapsedMs += dt;
        const invulnerable = now < ph.invulnUntil;

        // Ramp scroll speed with difficulty
        const tRamp = Math.min(1, ph.elapsedMs / state.difficultyRampMs);
        ph.scrollSpeed =
          state.scrollSpeedBase + (state.scrollSpeedMax - state.scrollSpeedBase) * tRamp;

        // Physics: gravity → vy → y
        ph.vy = Math.min(state.maxVy, ph.vy + state.gravity * dtSec);
        ph.y += ph.vy * dtSec;

        // Scroll pipes left
        const dx = ph.scrollSpeed * dtSec;
        for (const p of ph.pipes) p.x -= dx;
        ph.nextSpawnX -= dx;
        ph.pipes = ph.pipes.filter((p) => p.x + state.pipeW > -40);

        // Spawn pipes ahead until we have enough queued
        let safety = 12;
        while (
          (ph.nextSpawnX < state.worldW + state.pipeSpawnDx * 2 || ph.pipes.length < 4) &&
          safety-- > 0
        ) {
          spawnPipe();
        }

        // Helper: lose a life or end the run
        let died = false;
        const loseLife = (reason: string) => {
          if (invulnerable) return;
          ph.lives = Math.max(0, ph.lives - 1);
          setHud((h) => ({
            ...h,
            lives: ph.lives,
            hitFlashKey: h.hitFlashKey + 1,
            invulnerable: ph.lives > 0,
          }));
          if (ph.lives <= 0) {
            ph.crashed = reason;
            died = true;
          } else {
            ph.y = state.worldH / 2;
            ph.vy = 0;
            ph.invulnUntil = now + state.invulnMs;
          }
        };

        // World bounds (ceiling / floor cost a life)
        if (ph.y - state.planeRadius <= 0) {
          ph.y = state.planeRadius + 1;
          loseLife("ceiling");
        } else if (ph.y + state.planeRadius >= state.worldH) {
          ph.y = state.worldH - state.planeRadius - 1;
          loseLife("floor");
        }

        // Pipe collisions + scoring
        if (!died) {
          const pl = state.planeX - state.planeRadius;
          const pr = state.planeX + state.planeRadius;
          const pt = ph.y - state.planeRadius;
          const pb = ph.y + state.planeRadius;
          for (const p of ph.pipes) {
            const pLeft = p.x;
            const pRight = p.x + state.pipeW;
            const overlapsX = pr > pLeft && pl < pRight;
            if (overlapsX && !invulnerable) {
              if (pt < p.gapTop || pb > p.gapBottom) {
                p.passed = true;
                loseLife("pipe");
                break;
              }
            }
            if (!p.passed && pRight < pl) {
              p.passed = true;
              ph.pipesPassed += 1;
              ph.score += 100;
              setHud((h) => ({ ...h, pipesPassed: ph.pipesPassed }));
            }
          }
        }

        // Drop invulnerability flag when it expires
        const stillInvulnerable = now < ph.invulnUntil;
        setHud((h) =>
          h.invulnerable !== stillInvulnerable ? { ...h, invulnerable: stillInvulnerable } : h
        );

        // Anti-cheat checkpoint every N pipes
        const cpStep = Math.max(1, state.checkpointEveryPipes);
        const cpEpoch = Math.floor(ph.pipesPassed / cpStep);
        if (cpEpoch > lastCheckpointReportedRef.current && ph.pipesPassed > 0) {
          lastCheckpointReportedRef.current = cpEpoch;
          onCheckpointRef.current({
            pipesPassed: ph.pipesPassed,
            elapsedMs: Math.floor(ph.elapsedMs),
            lives: ph.lives,
            score: ph.score,
          });
        }

        // Win / lose: emit finish exactly once
        if (!ph.finished) {
          if (ph.pipesPassed >= state.targetPipes) {
            ph.finished = true;
            onFinishRef.current({
              pipesPassed: ph.pipesPassed,
              elapsedMs: Math.floor(ph.elapsedMs),
              score: ph.score,
              won: true,
            });
          } else if (ph.crashed) {
            ph.finished = true;
            const reason = ph.crashed;
            setHud((h) => ({ ...h, crashed: reason }));
            onFinishRef.current({
              pipesPassed: ph.pipesPassed,
              elapsedMs: Math.floor(ph.elapsedMs),
              score: ph.score,
              won: false,
            });
          }
        }
      }

      // ── Render
      // Plane
      const targetTilt = Math.max(-30, Math.min(70, (ph.vy / 800) * 60));
      tiltSmoothedRef.current += (targetTilt - tiltSmoothedRef.current) * 0.22;
      if (planeElRef.current) {
        const yPct = (ph.y / worldH) * 100;
        planeElRef.current.style.top = `${yPct}%`;
        planeElRef.current.style.left = `${planeXPct}%`;
        planeElRef.current.style.width = `${planeWPct}%`;
        planeElRef.current.style.transform = `translate(-50%, -50%) rotate(${tiltSmoothedRef.current.toFixed(2)}deg)`;
        planeElRef.current.style.opacity =
          now < ph.invulnUntil ? (Math.floor(now / 90) % 2 === 0 ? "0.35" : "1") : "1";
      }

      // Pipes
      const layer = pipesLayerRef.current;
      if (layer) {
        const seenIds = new Set<number>();
        for (const cp of ph.pipes) {
          seenIds.add(cp.id);
          const leftPct = (cp.x / worldW) * 100;
          const topH = (cp.gapTop / worldH) * 100;
          const bottomY = (cp.gapBottom / worldH) * 100;
          let pair = pipeNodesRef.current.get(cp.id);
          if (!pair) {
            const top = document.createElement("div");
            const bottom = document.createElement("div");
            const pipeClass = "absolute will-change-transform";
            top.className = pipeClass;
            bottom.className = pipeClass;
            const grad =
              "linear-gradient(to right, #047857 0%, #10b981 30%, #34d399 55%, #10b981 75%, #064e3b 100%)";
            top.style.background = grad;
            bottom.style.background = grad;
            top.style.borderRight = "4px solid #022c22";
            bottom.style.borderRight = "4px solid #022c22";
            top.style.boxShadow = "inset -6px 0 0 rgba(0,0,0,0.18), inset 6px 0 0 rgba(255,255,255,0.18)";
            bottom.style.boxShadow = "inset -6px 0 0 rgba(0,0,0,0.18), inset 6px 0 0 rgba(255,255,255,0.18)";
            const capTop = document.createElement("div");
            const capBottom = document.createElement("div");
            const capCss =
              "position:absolute;left:-4px;right:-8px;height:18px;background:linear-gradient(to right,#047857,#10b981 50%,#064e3b);border:3px solid #022c22;border-radius:4px;box-shadow:0 2px 0 rgba(0,0,0,0.2)";
            capTop.style.cssText = capCss + ";bottom:-6px";
            capBottom.style.cssText = capCss + ";top:-6px";
            top.appendChild(capTop);
            bottom.appendChild(capBottom);
            layer.appendChild(top);
            layer.appendChild(bottom);
            pair = { top, bottom };
            pipeNodesRef.current.set(cp.id, pair);
          }
          pair.top.style.left = `${leftPct}%`;
          pair.top.style.top = "0";
          pair.top.style.width = `${pipeWPct}%`;
          pair.top.style.height = `${topH}%`;
          pair.bottom.style.left = `${leftPct}%`;
          pair.bottom.style.top = `${bottomY}%`;
          pair.bottom.style.width = `${pipeWPct}%`;
          pair.bottom.style.bottom = "0";
        }
        for (const [id, pair] of pipeNodesRef.current.entries()) {
          if (!seenIds.has(id)) {
            pair.top.remove();
            pair.bottom.remove();
            pipeNodesRef.current.delete(id);
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-widest text-slate-500">
        {t("minerGames.loading")}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("minerGames.sky_runner.flap_aria")}
      onPointerDown={(e) => {
        e.preventDefault();
        flap();
      }}
      className="relative h-full w-full select-none overflow-hidden"
      style={{
        touchAction: "manipulation",
        background:
          "linear-gradient(to bottom, #0c4a6e 0%, #0284c7 25%, #38bdf8 55%, #7dd3fc 80%, #bae6fd 100%)",
      }}
    >
      {/* Sun */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: "78%",
          top: "8%",
          width: "16%",
          aspectRatio: "1 / 1",
          background:
            "radial-gradient(circle at 35% 35%, #fef9c3 0%, #fde047 45%, rgba(253,224,71,0) 70%)",
          filter: "blur(2px)",
        }}
      />

      {/* Parallax clouds — purely decorative */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[6%] top-[14%] h-8 w-28 rounded-full bg-white/80 blur-[2px]" />
        <div className="absolute left-[14%] top-[16%] h-10 w-20 rounded-full bg-white/85 blur-[1px]" />
        <div className="absolute left-[45%] top-[28%] h-7 w-20 rounded-full bg-white/70 blur-[2px]" />
        <div className="absolute left-[28%] top-[58%] h-6 w-24 rounded-full bg-white/60 blur-[2px]" />
        <div className="absolute left-[68%] top-[44%] h-9 w-32 rounded-full bg-white/75 blur-[1.5px]" />
        <div className="absolute left-[8%] top-[78%] h-5 w-16 rounded-full bg-white/55 blur-[2px]" />
      </div>

      {/* Pipes layer (rAF-managed nodes) */}
      <div
        ref={pipesLayerRef}
        className="pointer-events-none absolute inset-0"
        style={{ contain: "layout paint" }}
      />

      {/* Plane (rAF-managed transform) */}
      <div
        ref={planeElRef}
        className="absolute will-change-transform"
        style={{
          left: `${(state.planeX / state.worldW) * 100}%`,
          top: "50%",
          width: `${(state.planeRadius * 2 / state.worldW) * 100}%`,
          aspectRatio: "1 / 1",
          transform: "translate(-50%, -50%)",
          transformOrigin: "center",
          filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.35))",
        }}
      >
        <svg viewBox="0 0 80 80" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="planeBodyGrad" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#fef9c3" />
              <stop offset="55%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
            <linearGradient id="planeWingGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#9f1239" />
            </linearGradient>
            <radialGradient id="cockpitGrad" cx="0.4" cy="0.35" r="0.6">
              <stop offset="0%" stopColor="#bae6fd" />
              <stop offset="100%" stopColor="#0c4a6e" />
            </radialGradient>
          </defs>
          {/* Body */}
          <path
            d="M8 42 Q14 30 32 32 L56 30 Q66 30 72 36 L74 42 Q66 50 56 50 L32 50 Q14 50 8 42 Z"
            fill="url(#planeBodyGrad)"
            stroke="#854d0e"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Wing */}
          <path
            d="M30 38 L46 18 L54 18 L48 38 Z"
            fill="url(#planeWingGrad)"
            stroke="#7f1d1d"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Lower wing shadow */}
          <path d="M30 44 L46 56 L54 56 L48 44 Z" fill="#dc2626" opacity="0.85" stroke="#7f1d1d" strokeWidth="1.5" />
          {/* Tail fin */}
          <path d="M10 42 L4 26 L16 36 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" strokeLinejoin="round" />
          {/* Cockpit */}
          <ellipse cx="58" cy="38" rx="6" ry="4.5" fill="url(#cockpitGrad)" stroke="#0c4a6e" strokeWidth="1.5" />
          {/* Propeller hub */}
          <circle cx="73" cy="42" r="2.5" fill="#1f2937" />
          {/* Propeller blades (spinning illusion: two thin ellipses crossed) */}
          <ellipse cx="73" cy="42" rx="1" ry="12" fill="#475569" opacity="0.5">
            <animateTransform attributeName="transform" type="rotate" from="0 73 42" to="360 73 42" dur="0.12s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      </div>

      {/* Ground (decorative) */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-6"
        style={{
          background:
            "linear-gradient(to bottom, #65a30d 0%, #4d7c0f 40%, #365314 100%)",
          boxShadow: "inset 0 4px 0 rgba(255,255,255,0.15)",
        }}
      />

      {/* HUD: lives + progress (top bar) */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">
        {/* Lives (hearts) */}
        <div
          className="flex shrink-0 items-center gap-1 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur-sm"
          aria-label={t("minerGames.sky_runner.lives_aria", { lives: hud.lives })}
        >
          {Array.from({ length: state.maxLives }).map((_, i) => {
            const filled = i < hud.lives;
            return (
              <svg
                key={i}
                viewBox="0 0 24 24"
                className={[
                  "h-4 w-4 transition-all duration-300",
                  filled
                    ? "text-rose-400 drop-shadow-[0_0_4px_rgba(244,114,182,0.7)]"
                    : "text-slate-600 opacity-50",
                ].join(" ")}
                fill={filled ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            );
          })}
        </div>

        {/* Pipe progress */}
        <span className="rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm drop-shadow">
          {t("minerGames.sky_runner.pipes_progress", { current: hud.pipesPassed, total: state.targetPipes })}
        </span>

        {/* Tap hint */}
        <span className="hidden rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm drop-shadow sm:inline">
          {t("minerGames.sky_runner.tap_hint")}
        </span>
      </div>

      {/* Hit flash overlay — re-mounts on every life loss */}
      {hitFlashKey > 0 ? (
        <div
          key={hitFlashKey}
          className="pointer-events-none absolute inset-0 animate-ping bg-red-500/35"
          style={{ animationDuration: "600ms", animationIterationCount: 1 }}
        />
      ) : null}

      {hud.crashed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-sm">
          <span className="rounded-2xl bg-red-600/95 px-6 py-3 text-2xl font-black uppercase tracking-widest text-white shadow-2xl ring-4 ring-red-300/40">
            {t("minerGames.sky_runner.crashed")}
          </span>
        </div>
      ) : null}
    </div>
  );
});

const GameCardLink = memo(function GameCardLink({
  to,
  title,
  description,
  icon,
  color,
  ctaLabel,
  disabled = false,
  cooldownMinutes = 0
}: GameCardLinkProps) {
  const { t } = useTranslation();
  const base =
    "group relative block overflow-hidden rounded-3xl border p-6 text-left shadow-2xl transition-all duration-500 sm:rounded-[3rem] sm:p-8 lg:rounded-[4rem] lg:p-12";
  const activeCls = `${base} border-slate-800 bg-slate-900 hover:-translate-y-4 hover:border-primary`;
  const disabledCls = `${base} cursor-not-allowed border-slate-800/80 bg-slate-950 opacity-[0.42] grayscale`;

  const inner = (
    <>
      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-700 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? "opacity-5" : "opacity-10 group-hover:opacity-30"}`}
      />
      <div
        className={`mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${color} shadow-2xl transition-transform duration-500 sm:mb-10 sm:h-24 sm:w-24 sm:rounded-[2rem] lg:mb-12 lg:h-28 lg:w-28 lg:rounded-[3rem] ${disabled ? "" : "group-hover:rotate-12"}`}
      >
        {React.createElement(icon, {
          className: "h-10 w-10 text-white sm:h-12 sm:w-12 lg:h-14 lg:w-14",
          "aria-hidden": true
        })}
      </div>
      <h3 className="mb-4 break-words text-2xl font-black uppercase italic leading-none tracking-tight text-white sm:mb-6 sm:text-3xl lg:text-4xl">
        {title}
      </h3>
      <p className="mb-6 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200">
        {description}
      </p>
      {disabled && cooldownMinutes > 0 ? (
        <p className="mb-6 text-sm font-black uppercase tracking-wide text-amber-400/90">
          {t("game2048.arena_cooldown_minutes", { minutes: cooldownMinutes })}
        </p>
      ) : null}
      {disabled ? (
        <div className="text-xs font-black uppercase tracking-wide text-slate-500 sm:tracking-[0.35em]">
          {t("game2048.arena_unavailable")}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-wide text-primary transition-all duration-500 sm:gap-5 sm:tracking-[0.4em] md:translate-y-6 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
          {ctaLabel} <Play className="h-4 w-4 fill-current" aria-hidden />
        </div>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className={disabledCls} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link to={to} className={activeCls}>
      {inner}
    </Link>
  );
});

type GameCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  onClick: () => void;
  disabled: boolean;
  ctaStart: string;
  cooldownLabel: string;
};

const GameCard = memo(function GameCard({
  title,
  description,
  icon,
  color,
  onClick,
  disabled,
  ctaStart,
  cooldownLabel
}: GameCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/40 p-6 text-left shadow-2xl transition-all duration-500 backdrop-blur-sm sm:rounded-[3rem] sm:p-8 lg:rounded-[4rem] lg:p-12 ${disabled ? "cursor-not-allowed opacity-40 grayscale" : "hover:-translate-y-4 hover:border-primary hover:shadow-primary/20"}`}
    >
      {/* Decorative Corner */}
      <div className="absolute left-0 top-0 h-12 w-12 border-l-2 border-t-2 border-white/10 transition-colors group-hover:border-primary/50" />

      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-700 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? "opacity-10" : "opacity-10 group-hover:opacity-40"}`}
      />
      <div
        className={`mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br ${color} shadow-[0_0_30px_rgba(0,0,0,0.3)] transition-all duration-500 sm:mb-10 sm:h-24 sm:w-24 sm:rounded-[2.5rem] lg:mb-12 lg:h-32 lg:w-32 lg:rounded-[3.5rem] ${!disabled && "group-hover:rotate-[10deg] group-hover:scale-110"}`}
      >
        {React.createElement(icon, {
          className: "h-10 w-10 text-white drop-shadow-lg sm:h-12 sm:w-12 lg:h-16 lg:w-16",
          "aria-hidden": true
        })}
      </div>
      <h3 className="mb-4 break-words text-2xl font-black uppercase italic leading-none tracking-tighter text-white sm:mb-6 sm:text-3xl lg:text-5xl">
        {title}
      </h3>
      <p className="mb-8 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200 sm:mb-10 lg:mb-12">
        {description}
      </p>
      <div className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-primary transition-all duration-500 sm:gap-5 sm:tracking-[0.4em] md:translate-y-6 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
        {disabled ? (
          <span className="text-amber-500/80">{cooldownLabel}</span>
        ) : (
          <>
            {ctaStart} <Play className="h-4 w-4 fill-current" aria-hidden />
          </>
        )}
      </div>
    </button>
  );
});
