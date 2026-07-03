/**
 * BlockMiner verify scenes — web3 mining HUD aesthetic aligned with GamesPage cards.
 * Submitting: RollerCoin-style client → pool transfer. Result: mission debrief panel.
 */

import { motion } from "framer-motion";
import type { TFunction } from "i18next";
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Hash,
  Lightbulb,
  Loader2,
  RotateCcw,
  Server,
  Shield,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import type { GameVerifyRecord } from "../../../games/finish/gameVerifyStorage";

const SEGMENTS = 24;

/** Accent gradients per game — mirrors GamesPage card colors. */
const GAME_ACCENT: Record<string, string> = {
  memory: "from-blue-600 to-indigo-700",
  "match-3": "from-primary to-orange-600",
  cart: "from-sky-500 to-blue-700",
  stack: "from-amber-500 to-orange-700",
  sky: "from-sky-400 to-cyan-700",
  "2048": "from-emerald-600 to-teal-800",
};

function gameAccent(gameKey: string): string {
  return GAME_ACCENT[gameKey] ?? "from-primary to-accent";
}

function formatCooldown(seconds: number): string {
  if (seconds < 60) return `${seconds.toString().padStart(2, "0")}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* ── Shared chrome ────────────────────────────────────────────────────── */

function CornerBrackets({ accent = "primary" }: { accent?: "primary" | "success" | "fail" }) {
  const stroke =
    accent === "success"
      ? "border-emerald-400/40 group-hover:border-emerald-400/70"
      : accent === "fail"
        ? "border-fuchsia-400/35"
        : "border-primary/30 group-hover:border-primary/55";
  return (
    <>
      <span className={`pointer-events-none absolute left-0 top-0 h-10 w-10 border-l-2 border-t-2 ${stroke} transition-colors`} />
      <span className={`pointer-events-none absolute right-0 top-0 h-10 w-10 border-r-2 border-t-2 ${stroke} transition-colors`} />
      <span className={`pointer-events-none absolute bottom-0 left-0 h-10 w-10 border-b-2 border-l-2 ${stroke} transition-colors`} />
      <span className={`pointer-events-none absolute bottom-0 right-0 h-10 w-10 border-b-2 border-r-2 ${stroke} transition-colors`} />
    </>
  );
}

function AmbientBackdrop({ gradient, success }: { gradient: string; success?: boolean }) {
  return (
    <>
      <div
        className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 bg-gradient-to-br ${gradient} blur-[90px] opacity-25 sm:h-80 sm:w-80`}
      />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-accent/20 blur-[80px] opacity-20" />
      {success ? (
        <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-[120%] -translate-x-1/2 bg-gradient-to-b from-emerald-500/15 via-primary/5 to-transparent" />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </>
  );
}

function VerifyShell({
  children,
  gradient,
  success,
  fail,
  className = "",
}: {
  children: React.ReactNode;
  gradient: string;
  success?: boolean;
  fail?: boolean;
  className?: string;
}) {
  return (
    <motion.section
      className={`group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/55 shadow-2xl backdrop-blur-md sm:rounded-[2rem] ${className}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.985 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <AmbientBackdrop gradient={gradient} success={success} />
      <CornerBrackets accent={success ? "success" : fail ? "fail" : "primary"} />
      <div className="relative">{children}</div>
    </motion.section>
  );
}

/* ── Pixel art nodes ──────────────────────────────────────────────────── */

function PixelMonitor({ active, gradient }: { active: boolean; gradient: string }) {
  return (
    <div className="relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} blur-xl opacity-30 ${active ? "animate-pulse" : "opacity-10"}`} />
      <svg viewBox="0 0 88 96" className="relative h-[88px] w-[80px] sm:h-[100px] sm:w-[92px]" aria-hidden>
        <rect x="8" y="12" width="72" height="52" rx="2" fill="#1A1F2C" stroke="#3B82F6" strokeWidth="2" />
        <rect x="14" y="18" width="60" height="40" fill="#0B0F19" />
        <rect x="14" y="18" width="60" height="40" fill="url(#bmScreenGlow)" opacity={active ? 0.95 : 0.3} />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`${r}-${c}`}
              x={20 + c * 16}
              y={24 + r * 12}
              width="10"
              height="8"
              rx="1"
              fill={active && (r + c) % 2 === 0 ? "#3B82F6" : "#1e3a8a"}
              opacity={active ? 0.9 : 0.2}
            />
          )),
        )}
        <rect x="36" y="64" width="16" height="8" fill="#334155" />
        <rect x="28" y="72" width="32" height="6" rx="1" fill="#475569" />
        <defs>
          <linearGradient id="bmScreenGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function PixelServerRack({ active, progress }: { active: boolean; progress: number }) {
  const litRows = Math.floor(progress * 5);
  return (
    <div className="relative">
      <div className={`absolute inset-0 rounded-full bg-accent/30 blur-2xl ${active ? "opacity-40" : "opacity-0"}`} />
      <svg viewBox="0 0 72 96" className="relative h-[88px] w-[72px] sm:h-[100px] sm:w-[84px]" aria-hidden>
        <rect x="10" y="8" width="52" height="80" rx="3" fill="#1A1F2C" stroke="#8B5CF6" strokeWidth="2" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x="16" y={16 + i * 14} width="40" height="10" rx="1" fill="#0B0F19" stroke="#312e81" strokeWidth="1" />
            <circle
              cx="22"
              cy={21 + i * 14}
              r="2.5"
              fill={i < litRows && active ? "#3B82F6" : "#334155"}
              className={i < litRows && active ? "animate-pulse" : undefined}
            />
            <rect x="28" y={18 + i * 14} width="22" height="6" rx="1" fill={i < litRows ? "#1e3a8a" : "#0c1222"} />
          </g>
        ))}
        <rect x="24" y="86" width="24" height="4" rx="1" fill="#475569" />
      </svg>
    </div>
  );
}

/* ── SUBMITTING ───────────────────────────────────────────────────────── */

export function SubmittingScene({
  progress,
  gameLabel,
  gameKey,
  t,
}: {
  progress: number;
  gameLabel: string;
  gameKey?: string;
  t: TFunction;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const filledSegments = Math.round(progress * SEGMENTS);
  const activeStep = Math.min(4, Math.floor(progress * 5));
  const gradient = gameAccent(gameKey ?? "");
  const steps = ["session", "score", "time", "server", "reward"] as const;

  return (
    <VerifyShell gradient={gradient} className="shadow-primary/10">
      <div className="px-5 py-8 sm:px-10 sm:py-12" aria-live="polite" aria-busy="true">
        {/* header strip */}
        <div className="mb-8 flex flex-col items-center gap-2 text-center sm:mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-primary">
            <Shield className="h-3 w-3" aria-hidden />
            {t("gameFlow.progress_label")}
          </span>
          {gameLabel ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">{gameLabel}</p>
          ) : null}
        </div>

        <div className="relative mx-auto flex max-w-2xl items-center justify-between gap-2 sm:gap-6">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <PixelMonitor active={progress > 0.05} gradient={gradient} />
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
              <Cpu className="h-3 w-3 text-primary" aria-hidden />
              {t("gameFlow.client_label")}
            </span>
          </div>

          <div className="relative min-w-0 flex-1 px-1 sm:px-4">
            <div className="relative mb-4 h-10">
              <svg
                className="absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2 overflow-visible"
                viewBox="0 0 100 2"
                preserveAspectRatio="none"
                aria-hidden
              >
                <line x1="0" y1="1" x2="100" y2="1" stroke="#334155" strokeWidth="2" strokeDasharray="3 5" />
              </svg>
              <motion.div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-sm border border-primary/60 bg-primary shadow-[0_0_16px_rgba(59,130,246,0.9)]"
                style={{ left: `${Math.min(90, progress * 90)}%` }}
                animate={{ scale: [1, 1.2, 1], boxShadow: ["0 0 12px rgba(59,130,246,0.6)", "0 0 22px rgba(59,130,246,1)", "0 0 12px rgba(59,130,246,0.6)"] }}
                transition={{ duration: 0.7, repeat: Infinity }}
              />
              <motion.div
                className="absolute -top-1 text-primary"
                style={{ left: `${Math.min(90, progress * 90)}%`, x: "-50%" }}
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              >
                <Zap className="h-4 w-4 fill-primary/25" aria-hidden />
              </motion.div>
            </div>

            <p className="mb-5 text-center font-mono text-[10px] font-black uppercase tracking-[0.35em] text-primary drop-shadow-[0_0_18px_rgba(59,130,246,0.55)] sm:text-[11px]">
              {t("gameFlow.submitting_label")}
            </p>

            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
              {Array.from({ length: SEGMENTS }, (_, i) => {
                const on = i < filledSegments;
                const edge = i === filledSegments - 1 && pct < 100;
                return (
                  <motion.span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3 ${
                      on
                        ? "bg-gradient-to-br from-primary to-accent shadow-[0_0_12px_rgba(59,130,246,0.75)]"
                        : "bg-slate-950 ring-1 ring-slate-800"
                    }`}
                    animate={edge ? { scale: [1, 1.3, 1] } : undefined}
                    transition={edge ? { duration: 0.45, repeat: Infinity } : undefined}
                  />
                );
              })}
            </div>
            <p className="mt-3 text-center font-mono text-xs font-bold tabular-nums text-primary/80">{pct}%</p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2">
            <PixelServerRack active={progress > 0.2} progress={progress} />
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
              <Server className="h-3 w-3 text-accent" aria-hidden />
              {t("gameFlow.server_label")}
            </span>
          </div>
        </div>

        <ul className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2">
          {steps.map((key, i) => {
            const done = i < activeStep;
            const current = i === activeStep;
            return (
              <li
                key={key}
                className={`rounded-full border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                  done
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : current
                      ? "border-accent/50 bg-accent/15 text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.65)]"
                      : "border-slate-800 bg-slate-950/60 text-slate-600"
                }`}
              >
                {done ? "✓ " : current ? "● " : ""}
                {t(`gameFlow.step_${key}`)}
              </li>
            );
          })}
        </ul>

        <div className="mx-auto mt-8 flex max-w-lg items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 backdrop-blur-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
            <Lightbulb className="h-4 w-4 text-amber-300" aria-hidden />
          </div>
          <p className="text-xs leading-relaxed text-slate-400 sm:text-sm">{t("gameFlow.submitting_hint")}</p>
        </div>
      </div>
    </VerifyShell>
  );
}

/* ── RESULT ───────────────────────────────────────────────────────────── */

function HudStatCard({
  label,
  value,
  index,
  gradient,
}: {
  label: string;
  value: string;
  index: number;
  gradient: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.96 },
        show: { opacity: 1, y: 0, scale: 1 },
      }}
      className="group/stat relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${gradient} opacity-80`} />
      <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/10 blur-2xl opacity-0 transition-opacity group-hover/stat:opacity-100" />
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-black tabular-nums tracking-tight text-white sm:text-3xl">{value}</p>
      <span className="absolute bottom-2 right-3 font-mono text-[9px] text-slate-700">#{String(index + 1).padStart(2, "0")}</span>
    </motion.div>
  );
}

export function ResultScene({
  record,
  gameLabel,
  cooldownSeconds,
  onPlayAgain,
  onExit,
  t,
}: {
  record: GameVerifyRecord;
  gameLabel: string;
  cooldownSeconds: number;
  onPlayAgain: () => void;
  onExit: () => void;
  t: TFunction;
}) {
  const resolution = record.resolution;
  const isResultSuccess = resolution?.outcome === "success";
  const isRejected = resolution?.outcome === "rejected";
  const blocked = cooldownSeconds > 0;
  const stats = record.stats;
  const gradient = gameAccent(record.gameKey);
  const totalCooldown = Math.max(1, resolution?.cooldownSeconds ?? cooldownSeconds);
  const cooldownPct =
    cooldownSeconds > 0 ? Math.max(0, Math.min(100, ((totalCooldown - cooldownSeconds) / totalCooldown) * 100)) : 100;

  return (
    <VerifyShell gradient={gradient} success={isResultSuccess} fail={!isResultSuccess}>
      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-slate-800/80 px-6 py-10 sm:px-10 sm:py-12">
        <div className={`absolute -right-20 -top-20 h-64 w-64 bg-gradient-to-br ${gradient} blur-[100px] opacity-20`} />

        {isResultSuccess && (
          <>
            {[...Array(6)].map((_, i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute h-1 w-1 rounded-full bg-primary"
                style={{ left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 18}%` }}
                animate={{ opacity: [0.2, 0.9, 0.2], y: [0, -8, 0] }}
                transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </>
        )}

        <div className="relative flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.05 }}
            className={`relative mb-5 flex h-20 w-20 items-center justify-center rounded-[1.25rem] border-2 bg-gradient-to-br shadow-2xl sm:h-24 sm:w-24 sm:rounded-2xl ${
              isResultSuccess
                ? "border-emerald-400/50 from-emerald-500/25 to-primary/20 shadow-emerald-500/25 animate-logo-ring"
                : "border-fuchsia-400/40 from-fuchsia-500/20 to-slate-900 shadow-fuchsia-500/20"
            }`}
          >
            {isResultSuccess ? (
              <Trophy className="h-9 w-9 text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)] sm:h-11 sm:w-11" aria-hidden />
            ) : (
              <Hash className="h-9 w-9 text-fuchsia-300 sm:h-11 sm:w-11" aria-hidden />
            )}
            {isResultSuccess && (
              <motion.span
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-500/30"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.35, type: "spring" }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-200" aria-hidden />
              </motion.span>
            )}
          </motion.div>

          {gameLabel ? (
            <p className={`text-[10px] font-black uppercase tracking-[0.35em] ${isResultSuccess ? "text-primary" : "text-fuchsia-400/80"}`}>
              {gameLabel}
            </p>
          ) : null}

          <h1 className="mt-2 text-3xl font-black uppercase italic leading-none tracking-tight text-white sm:text-4xl">
            {isResultSuccess
              ? t("gameFlow.success_title")
              : isRejected
                ? t("gameFlow.rejected_title")
                : t("gameFlow.failure_title")}
          </h1>

          {isResultSuccess ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary"
            >
              <Shield className="h-3 w-3" aria-hidden />
              {t("gameFlow.verified_badge")}
            </motion.p>
          ) : (
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">
              {isRejected ? t("gameFlow.rejected_subtitle") : t("gameFlow.failure_subtitle")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6 px-5 py-7 sm:space-y-7 sm:px-9 sm:py-9">
        {/* Stats HUD */}
        {!isRejected && stats.length > 0 && (
          <motion.div
            className="grid grid-cols-2 gap-3 sm:gap-4"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } } }}
          >
            {stats.map((stat, i) => (
              <HudStatCard key={stat.label} label={stat.label} value={stat.value} index={i} gradient={gradient} />
            ))}
          </motion.div>
        )}

        {/* Power reward — amber like TemporaryPowerSummary */}
        {isResultSuccess && resolution?.rewardMessage ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="relative overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/20 via-amber-600/8 to-slate-950/80 p-5 shadow-lg shadow-amber-500/10"
          >
            <motion.div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/10 to-transparent"
              animate={{ x: ["-120%", "220%"] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
            />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/25 shadow-inner">
                <Zap className="h-6 w-6 text-amber-200" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/90">
                  {t("gameFlow.reward_label")}
                </p>
                <p className="mt-1.5 text-lg font-black leading-snug text-amber-50 sm:text-xl">{resolution.rewardMessage}</p>
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* Cooldown + actions row */}
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#1e293b" strokeWidth="2.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke={blocked ? "#f59e0b" : "#3B82F6"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${(cooldownPct / 100) * 94.2} 94.2`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center">
                  {blocked ? (
                    <Timer className="h-5 w-5 text-amber-400" aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
                  )}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                  {isResultSuccess ? t("gameFlow.next_match_label") : t("gameFlow.next_try_label")}
                </p>
                <p className="mt-1 font-mono text-3xl font-black tabular-nums text-white">
                  {blocked ? formatCooldown(cooldownSeconds) : t("gameFlow.ready_now")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:min-w-[280px]">
            <button
              type="button"
              onClick={onPlayAgain}
              disabled={blocked}
              className={`group/btn relative overflow-hidden rounded-2xl px-6 py-4 text-sm font-black uppercase tracking-wider transition-all ${
                blocked
                  ? "cursor-not-allowed border border-slate-800 bg-slate-950/80 text-slate-600"
                  : "border border-primary/40 bg-gradient-to-r from-primary to-blue-600 text-white shadow-lg shadow-primary/30 hover:-translate-y-0.5 hover:shadow-primary/45"
              }`}
            >
              {!blocked && (
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 transition-opacity group-hover/btn:opacity-100" />
              )}
              <span className="relative flex items-center justify-center gap-2">
                {blocked ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden />
                )}
                {blocked
                  ? t("gameFlow.play_again_wait", { seconds: cooldownSeconds })
                  : t("gameFlow.play_again")}
              </span>
            </button>
            <button
              type="button"
              onClick={onExit}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/50 px-6 py-3.5 text-sm font-black uppercase tracking-wider text-slate-300 transition-all hover:border-primary/40 hover:bg-slate-800/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {isResultSuccess ? t("gameFlow.back_to_arena") : t("gameFlow.back")}
            </button>
          </div>
        </div>
      </div>
    </VerifyShell>
  );
}
