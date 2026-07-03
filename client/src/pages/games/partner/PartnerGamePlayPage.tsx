import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ExternalLink,
  Gamepad2,
  Loader2,
  Pause,
  Play,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { usePartnerGameSession, formatDuration, formatCountdownMs } from "./usePartnerGameSession";

function IframeSkeleton() {
  return (
    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-900 via-slate-950 to-black">
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
        <div className="h-3 w-48 rounded-full bg-slate-800" />
        <div className="h-3 w-32 rounded-full bg-slate-800/70" />
      </div>
    </div>
  );
}

export default function PartnerGamePlayPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeLoadedRef = useRef(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [rewardPulse, setRewardPulse] = useState(false);
  const prevGrantsRef = useRef(0);

  const playEligible = iframeLoaded || iframeBlocked;

  const {
    game,
    session,
    loading,
    error,
    isPlaying,
    pageActive,
    displayPlayingSeconds,
    nextRewardMs,
  } = usePartnerGameSession(slug, playEligible);

  useEffect(() => {
    iframeLoadedRef.current = false;
    setIframeLoaded(false);
    setIframeBlocked(false);

    const timer = window.setTimeout(() => {
      if (!iframeLoadedRef.current) setIframeBlocked(true);
    }, 15000);

    return () => window.clearTimeout(timer);
  }, [game?.id]);

  useEffect(() => {
    if (!session) return;
    if (session.grantsCount > prevGrantsRef.current) {
      setRewardPulse(true);
      toast.success(t("partnerGames.play.reward_toast", { hash: 5 }));
      const id = window.setTimeout(() => setRewardPulse(false), 1200);
      prevGrantsRef.current = session.grantsCount;
      return () => window.clearTimeout(id);
    }
    prevGrantsRef.current = session.grantsCount;
    return undefined;
  }, [session?.grantsCount, session, t]);

  const openExternal = useCallback(() => {
    const url = game?.fallbackUrl ?? game?.partnerUrl ?? game?.iframeUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [game]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Gamepad2 className="mx-auto h-12 w-12 text-slate-600" />
        <p className="mt-4 text-lg font-bold text-white">{t("partnerGames.play.not_found")}</p>
        <button
          type="button"
          onClick={() => navigate("/games")}
          className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black"
        >
          {t("partnerGames.play.back")}
        </button>
      </div>
    );
  }

  const externalUrl = game.fallbackUrl ?? game.partnerUrl ?? game.iframeUrl;
  const statusLabel = isPlaying
    ? t("partnerGames.play.status_playing")
    : t("partnerGames.play.status_paused");

  return (
    <div className="w-full">
      {/* Header */}
      <header className="mb-4 flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={() => navigate("/games")}
            className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("partnerGames.play.back")}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-white sm:text-xl">{game.title}</h1>
            <p className="text-xs text-slate-500">{t("partnerGames.play.category")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {t("partnerGames.play.time_today")}
            </p>
            <p className="text-sm font-bold tabular-nums text-white">
              {formatDuration(displayPlayingSeconds)}
            </p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-center transition-colors ${
              rewardPulse
                ? "border-emerald-500/50 bg-emerald-500/15"
                : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {t("partnerGames.play.hash_today")}
            </p>
            <p className="text-sm font-bold tabular-nums text-emerald-400">
              +{session?.hashEarnedToday ?? 0} H/s
            </p>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
              isPlaying
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-amber-500/30 bg-amber-500/10"
            }`}
          >
            {isPlaying ? (
              <Play className="h-4 w-4 text-emerald-400" />
            ) : (
              <Pause className="h-4 w-4 text-amber-400" />
            )}
            <span
              className={`text-xs font-bold ${isPlaying ? "text-emerald-300" : "text-amber-300"}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        {/* Main play area */}
        <div className="min-w-0">
          {!pageActive && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <Pause className="h-4 w-4 shrink-0" />
              {t("partnerGames.play.paused_hint")}
            </div>
          )}
          {pageActive && !iframeBlocked && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
              {t("partnerGames.play.active_hint")}
            </div>
          )}

          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl">
            <div className="relative h-[min(62vh,820px)] min-h-[360px] w-full sm:min-h-[440px]">
              {!iframeLoaded && !iframeBlocked && <IframeSkeleton />}
              <iframe
                ref={iframeRef}
                src={game.iframeUrl}
                title={game.title}
                className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${
                  iframeLoaded ? "opacity-100" : "opacity-0"
                }`}
                allow="autoplay; fullscreen; gamepad; clipboard-write; payment; microphone; camera"
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => {
                  iframeLoadedRef.current = true;
                  setIframeLoaded(true);
                  setIframeBlocked(false);
                }}
              />
              {iframeBlocked && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-slate-950/95 to-black/95 px-6 text-center backdrop-blur-sm">
                  <WifiOff className="h-12 w-12 text-slate-600" />
                  <div className="max-w-md space-y-2">
                    <p className="text-lg font-bold text-white">
                      {t("partnerGames.play.blocked_title")}
                    </p>
                    <p className="text-sm leading-relaxed text-slate-400">
                      {t("partnerGames.play.blocked_desc")}
                    </p>
                    <p className="text-xs text-slate-500">{t("partnerGames.play.blocked_note")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={openExternal}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-black transition-transform hover:scale-[1.02]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("partnerGames.play.open_partner")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Timers below iframe on mobile */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:hidden">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">
                {t("partnerGames.play.playing_now")}
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                {formatDuration(displayPlayingSeconds)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">
                {t("partnerGames.play.next_reward")}
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-primary">
                {formatCountdownMs(nextRewardMs)}
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-400">
              {t("partnerGames.play.info_title")}
            </h2>

            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-500">
                {t("partnerGames.play.playing_now")}
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-white">
                {formatDuration(displayPlayingSeconds)}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-500">
                {t("partnerGames.play.next_reward")}
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-primary">
                {formatCountdownMs(nextRewardMs)}
              </p>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <p className="text-[10px] font-semibold uppercase text-slate-500">
                {t("partnerGames.play.partner_label")}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">{game.title}</p>
            </div>

            {game.description && (
              <p className="text-xs leading-relaxed text-slate-400">{game.description}</p>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-xs font-bold text-slate-300">{t("partnerGames.play.rules_title")}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {t("partnerGames.play.rules_body")}
              </p>
            </div>

            {externalUrl && (
              <button
                type="button"
                onClick={openExternal}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:border-slate-600"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("partnerGames.play.open_original")}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
