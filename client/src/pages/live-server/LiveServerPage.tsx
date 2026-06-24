import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Activity, RefreshCw, Coins, Radio, Wifi, TrendingUp, Zap } from "lucide-react";
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';

interface LiveServerBlock {
  num: string | number;
  time: string;
  reward: string;
}

interface LiveServerStats {
  activeMiners?: number;
  networkHashRate?: number;
  recentBlocks?: LiveServerBlock[];
  networkDifficulty?: number | string;
  transactionsLast24h?: number;
  blockTimeLabel?: string;
  rewardPolLabel?: string;
  usersTotal?: number;
  newUsers24h?: number;
  polInUserBalances?: number | string;
  pendingWithdrawalsCount?: number;
  rewardBlkLabel?: string;
  frequencyLabel?: string;
  polDeposited24h?: number | string;
  polWithdrawn24h?: number | string;
  generatedAt?: string;
}

function getYoutubeEmbedId() {
  const direct = String(import.meta.env.VITE_LIVE_SERVER_YOUTUBE_ID || "").trim();
  if (direct) return direct;
  const url = String(import.meta.env.VITE_YOUTUBE_URL || "").trim();
  const m = url.match(/[?&]v=([^&]+)/);
  if (m) return m[1];
  const short = url.match(/youtu\.be\/([^?/]+)/);
  if (short) return short[1];
  return "JLonk07l88Q";
}

function formatPol(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(x);
}

function formatHashrate(hs: number) {
  if (!hs || hs === 0) return "0 H/s";
  if (hs >= 1e12) return `${(hs / 1e12).toFixed(1)}T`;
  if (hs >= 1e9) return `${(hs / 1e9).toFixed(1)}G`;
  if (hs >= 1e6) return `${(hs / 1e6).toFixed(1)}M`;
  return `${(hs / 1e3).toFixed(0)}K`;
}

interface StatsCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

function StatsCard({ children, delay = 0, className = "" }: StatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={`rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-sm p-5 ${className}`}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedNumberProps {
  value: string | number;
  className?: string;
}

function AnimatedNumber({ value, className = "" }: AnimatedNumberProps) {
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.1, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      {value}
    </motion.span>
  );
}

function VideoPlayer({ videoId }: { videoId: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(videoId)}&controls=0&modestbranding=1&playsinline=1&rel=0&enablejsapi=1`;

  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-950 overflow-hidden aspect-video">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            <span className="text-sm text-slate-400">Loading...</span>
          </div>
        </div>
      )}
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Wifi className="h-12 w-12" />
            <span>Video unavailable</span>
          </div>
        </div>
      ) : (
        <iframe
          className="relative z-10 w-full h-full"
          src={src}
          title="YouTube Live Stream"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      )}
    </div>
  );
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div
          className="absolute inset-0 animate-ping rounded-full bg-red-500/60"
          style={{ animationDuration: "1.5s" }}
        />
        <div className="relative h-3 w-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
      </div>
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">LIVE</span>
    </div>
  );
}

export default function LiveServer() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stats, setStats] = useState<LiveServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const videoId = getYoutubeEmbedId();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live-server-stats", { credentials: "omit" });
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "ok" in data &&
        (data as { ok?: unknown }).ok &&
        "stats" in data &&
        typeof (data as { stats?: unknown }).stats === "object" &&
        (data as { stats?: unknown }).stats !== null
      ) {
        setStats((data as { stats: LiveServerStats }).stats);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const tryFs = () => {
      const el = rootRef.current || document.documentElement;
      if (el?.requestFullscreen) {
        void el.requestFullscreen().catch(() => {});
      }
    };
    const q = new URLSearchParams(window.location.search).get("fullscreen");
    const delay = q === "0" ? null : q === "1" ? 300 : 600;
    if (delay == null) return undefined;
    const t = window.setTimeout(tryFs, delay);
    return () => window.clearTimeout(t);
  }, []);

  const activeMiners = stats?.activeMiners ?? 0;
  const hashrate = stats?.networkHashRate ?? 0;
  const recentBlocks = Array.isArray(stats?.recentBlocks) ? stats.recentBlocks : [];
  const diffT = Number(stats?.networkDifficulty);
  const difficultyLabel = Number.isFinite(diffT) && diffT > 0 ? `${diffT.toFixed(1)}T` : "—";

  return (
    <div ref={rootRef} className="min-h-screen bg-[#030712] text-white overflow-x-hidden">
      <div className="mx-auto max-w-[1920px] p-4 lg:p-6">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-center gap-4">
            <LiveIndicator />
            <h1 className="text-2xl lg:text-4xl font-black tracking-tight text-white">BLOCKMINER</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <Activity className="h-5 w-5 text-sky-400" />
              <span className="text-base font-medium text-slate-300">
                <AnimatedNumber value={activeMiners} /> online
              </span>
            </div>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const el = rootRef.current || document.documentElement;
                if (document.fullscreenElement) {
                  void document.exitFullscreen().catch(() => {});
                } else if (el?.requestFullscreen) {
                  void el.requestFullscreen().catch(() => {});
                }
              }}
              className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-white/10"
            >
              Fullscreen
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sky-400 transition-colors hover:bg-sky-500/20"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </motion.button>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          <aside className="flex flex-col gap-4 lg:col-span-2">
            <StatsCard delay={0.1}>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-yellow-400">
                <Zap className="h-4 w-4" />
                INDICATORS
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Active Miners</span>
                  <AnimatedNumber value={activeMiners} className="text-lg font-bold text-sky-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Tx 24h</span>
                  <AnimatedNumber
                    value={stats?.transactionsLast24h ?? 0}
                    className="text-lg font-bold text-emerald-400"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Block Time</span>
                  <span className="text-lg font-bold text-purple-400">
                    {stats?.blockTimeLabel ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Reward</span>
                  <span className="text-lg font-bold text-amber-400">
                    {stats?.rewardPolLabel ?? "—"}
                  </span>
                </div>
              </div>
            </StatsCard>

            <StatsCard delay={0.2} className="flex-1">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
                <TrendingUp className="h-4 w-4" />
                RECENT BLOCKS
              </h3>
              <div className="space-y-3">
                {recentBlocks.length === 0 ? (
                  <p className="text-sm text-slate-500">No blocks yet.</p>
                ) : (
                  recentBlocks.map((block, i) => (
                    <motion.div
                      key={block.num}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="flex items-center justify-between rounded-lg bg-white/5 p-2"
                    >
                      <span className="font-mono text-sm text-sky-400">#{block.num}</span>
                      <span className="text-xs text-slate-500">{block.time}</span>
                      <span className="text-sm font-bold text-emerald-400">{block.reward}</span>
                    </motion.div>
                  ))
                )}
              </div>
            </StatsCard>
          </aside>

          <section className="flex flex-col gap-4 lg:col-span-7">
            <VideoPlayer videoId={videoId} />

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "Total Users", value: stats?.usersTotal ?? 0, color: "text-white" },
                { label: "New 24h", value: stats?.newUsers24h ?? 0, color: "text-emerald-400" },
                {
                  label: "POL Balance",
                  value: formatPol(stats?.polInUserBalances || 0),
                  color: "text-sky-400"
                },
                {
                  label: "Pending",
                  value: stats?.pendingWithdrawalsCount ?? 0,
                  color: "text-amber-400"
                }
              ].map((item, i) => (
                <StatsCard key={item.label} delay={0.3 + i * 0.1} className="text-center">
                  <AnimatedNumber value={item.value} className={`text-4xl lg:text-5xl font-black ${item.color}`} />
                  <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                </StatsCard>
              ))}
            </div>
          </section>

          <aside className="flex flex-col gap-4 lg:col-span-3">
            <StatsCard delay={0.15}>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-sky-400">
                <Wifi className="h-4 w-4" />
                NETWORK
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Hashrate</span>
                  <AnimatedNumber
                    value={formatHashrate(hashrate)}
                    className="font-mono text-base font-bold text-purple-400"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Difficulty</span>
                  <span className="font-mono text-base font-bold text-sky-400">{difficultyLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">BLK / cycle</span>
                  <span className="font-mono text-base font-bold text-amber-400">
                    {stats?.rewardBlkLabel ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">BLK frequency</span>
                  <span className="text-base font-bold text-emerald-400">
                    {stats?.frequencyLabel ?? "—"}
                  </span>
                </div>
              </div>
            </StatsCard>

            <StatsCard delay={0.25} className="flex-1">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
                <Activity className="h-4 w-4" />
                LIVE EVENTS
              </h3>
              <div className="space-y-3 text-sm text-slate-400">
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="truncate"
                >
                  Hashrate: {formatHashrate(hashrate)}
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="truncate"
                >
                  {activeMiners} active miners
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="truncate"
                >
                  {formatPol(stats?.polDeposited24h || 0)} POL deposited 24h
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="truncate"
                >
                  {formatPol(stats?.polWithdrawn24h || 0)} POL withdrawn 24h
                </motion.p>
              </div>
            </StatsCard>

            <StatsCard delay={0.35}>
              <motion.div
                className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 p-3"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
                  <Coins className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-white">Network Status</span>
                  <span className="text-xs text-emerald-400">● Online</span>
                </div>
              </motion.div>
            </StatsCard>
          </aside>
        </div>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-sm text-slate-500"
        >
          <span className="font-medium">BlockMiner Live Dashboard</span>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
            <span>
              Last Update:{" "}
              {stats?.generatedAt ? new Date(stats.generatedAt).toLocaleTimeString() : "--:--:--"}
            </span>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
