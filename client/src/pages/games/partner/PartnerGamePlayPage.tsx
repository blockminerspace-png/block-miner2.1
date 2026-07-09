import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ExternalLink,
  Gamepad2,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  usePartnerGameSession,
  formatDuration,
  formatCountdownMs,
} from "./usePartnerGameSession";
import {
  resolvePlayerPhase,
  usePartnerIframe,
  type PartnerEmbedStatus,
} from "./usePartnerIframe";
import { useGameStore } from "../../../store/game";

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

function embedReasonKey(status: string | null | undefined): string {
  const code = status ?? "unknown";
  const known: PartnerEmbedStatus[] = [
    "blocked_x_frame_options",
    "blocked_frame_ancestors",
    "blocked_cloudflare",
    "auth_page",
    "api_endpoint",
    "fetch_error",
  ];
  if (known.includes(code as PartnerEmbedStatus)) {
    return `partnerGames.play.errors.${code}`;
  }
  return "partnerGames.play.errors.unknown";
}

export default function PartnerGamePlayPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [externalPlayStarted, setExternalPlayStarted] = useState(false);
  const [rewardPulse, setRewardPulse] = useState(false);
  const prevGrantsRef = useRef(0);
  const playSurfaceReadyRef = useRef(false);

  const closeChat = useGameStore((s) => s.closeChat);
  useEffect(() => {
    closeChat();
  }, [closeChat]);

  const {
    game,
    session,
    loading,
    sessionLoading,
    error,
    playActive,
    pageVisible,
    online,
    embeddable,
    displayPlayingSeconds,
    nextRewardMs,
    reconnecting,
  } = usePartnerGameSession(slug, playSurfaceReadyRef);

  const {
    iframeRef,
    iframeLoaded,
    loadTimedOut,
    reloadToken,
    onIframeLoad,
    reload,
    requestFullscreen,
  } = usePartnerIframe(game?.id, game?.iframeUrl, embeddable);

  const playSurfaceReady = embeddable ? iframeLoaded : externalPlayStarted;
  playSurfaceReadyRef.current = playSurfaceReady;

  const isPlaying = playActive && playSurfaceReady && session?.status === "active";

  const phase = resolvePlayerPhase({
    sessionLoading,
    gameLoading: loading,
    embeddable,
    externalPlayStarted,
    iframeLoaded,
    loadTimedOut,
    embedStatus: game?.embedStatus,
  });

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

  const externalUrl = game?.fallbackUrl ?? game?.partnerUrl ?? game?.iframeUrl ?? "";

  const openExternal = useCallback(() => {
    if (!externalUrl) return;
    window.open(externalUrl, "_blank", "noopener,noreferrer");
    setExternalPlayStarted(true);
  }, [externalUrl]);

  const closePlayer = useCallback(() => {
    navigate("/games");
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary/70" />
          <p className="text-sm text-slate-500">{t("partnerGames.play.state_loading")}</p>
        </div>
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

  const statusLabel = isPlaying
    ? t("partnerGames.play.status_playing")
    : t("partnerGames.play.status_paused");

  const connectionLabel = !online
    ? t("partnerGames.play.connection_offline")
    : reconnecting
      ? t("partnerGames.play.connection_reconnecting")
      : t("partnerGames.play.connection_online");

  const showIframe = embeddable && phase !== "error";
  const errorReasonKey = loadTimedOut
    ? "partnerGames.play.errors.timeout"
    : embedReasonKey(game.embedStatus);

  return (
    <div className="w-full" data-partner-player-shell>
      <header className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={closePlayer}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("partnerGames.play.back")}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black text-white sm:text-lg">{game.title}</h1>
            <p className="text-[11px] text-slate-500">{t("partnerGames.play.category")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {t("partnerGames.play.session_time")}
            </p>
            <p className="text-sm font-bold tabular-nums text-white">
              {formatDuration(displayPlayingSeconds)}
            </p>
          </div>
          <div
            className={`rounded-lg border px-3 py-1.5 text-center transition-colors ${
              rewardPulse
                ? "border-emerald-500/50 bg-emerald-500/15"
                : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {t("partnerGames.play.hash_today")}
            </p>
            <p className="text-sm font-bold tabular-nums text-emerald-400">
              +{session?.hashEarnedToday ?? 0} H/s
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {t("partnerGames.play.next_reward")}
            </p>
            <p className="text-sm font-bold tabular-nums text-primary">
              {formatCountdownMs(nextRewardMs)}
            </p>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${
              isPlaying
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-amber-500/30 bg-amber-500/10"
            }`}
          >
            {isPlaying ? (
              <Play className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Pause className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span
              className={`text-[11px] font-bold ${isPlaying ? "text-emerald-300" : "text-amber-300"}`}
            >
              {statusLabel}
            </span>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${
              online && !reconnecting
                ? "border-sky-500/30 bg-sky-500/10"
                : "border-slate-700 bg-slate-900/60"
            }`}
          >
            {online && !reconnecting ? (
              <Wifi className="h-3.5 w-3.5 text-sky-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-slate-500" />
            )}
            <span className="text-[11px] font-bold text-slate-400">{connectionLabel}</span>
          </div>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {embeddable && (
          <>
            <button
              type="button"
              onClick={requestFullscreen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              {t("partnerGames.fullscreen")}
            </button>
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("partnerGames.play.reload")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={openExternal}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("partnerGames.open_in_new_tab")}
        </button>
        <button
          type="button"
          onClick={closePlayer}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-300 hover:text-red-200"
        >
          <X className="h-3.5 w-3.5" />
          {t("partnerGames.play.close")}
        </button>
      </div>

      {!pageVisible && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Pause className="h-4 w-4 shrink-0" />
          {t("partnerGames.play.paused_hint")}
        </div>
      )}

      {!online && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-600/40 bg-slate-800/40 px-4 py-3 text-sm text-slate-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          {t("partnerGames.play.offline_hint")}
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl">
        <div className="relative h-[min(78vh,960px)] min-h-[420px] w-full">
          {phase === "initializing" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-slate-400">{t("partnerGames.play.state_initializing")}</p>
            </div>
          )}

          {phase === "connecting" && <IframeSkeleton />}

          {showIframe && (
            <iframe
              key={reloadToken}
              ref={iframeRef}
              src={game.iframeUrl}
              title={game.title}
              className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${
                iframeLoaded ? "opacity-100" : "opacity-0"
              }`}
              allow="autoplay; fullscreen; gamepad; clipboard-write; payment; microphone; camera"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={onIframeLoad}
            />
          )}

          {(phase === "error" || (!embeddable && !externalPlayStarted)) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-slate-950/98 to-black px-6 text-center">
              <WifiOff className="h-12 w-12 text-slate-600" />
              <div className="max-w-lg space-y-2">
                <p className="text-lg font-bold text-white">
                  {t("partnerGames.play.embed_blocked_title")}
                </p>
                <p className="text-sm leading-relaxed text-slate-400">{t(errorReasonKey)}</p>
                {game.embedBlockReason ? (
                  <p className="text-xs text-slate-500">{game.embedBlockReason}</p>
                ) : null}
                {!embeddable && !externalPlayStarted ? (
                  <p className="text-xs text-slate-500">{t("partnerGames.play.external_reward_hint")}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={openExternal}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-black transition-transform hover:scale-[1.02]"
              >
                <ExternalLink className="h-4 w-4" />
                {t("partnerGames.open_in_new_tab")}
              </button>
            </div>
          )}

          {externalPlayStarted && !embeddable && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-950/95 to-black px-6 text-center">
              <Play className="h-12 w-12 text-emerald-500/80" />
              <p className="text-lg font-bold text-white">{t("partnerGames.play.external_active_title")}</p>
              <p className="max-w-md text-sm text-slate-400">
                {t("partnerGames.play.external_active_desc")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-500">
            {t("partnerGames.play.hash_session")}
          </p>
          <p className="mt-1 text-lg font-black tabular-nums text-emerald-400">
            +{session?.hashEarnedSession ?? 0} H/s
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-500">
            {t("partnerGames.play.grants_count")}
          </p>
          <p className="mt-1 text-lg font-black tabular-nums text-white">
            {session?.grantsCount ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-500">
            {t("partnerGames.play.partner_label")}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{game.title}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-500">
            {t("partnerGames.play.embed_status")}
          </p>
          <p className="mt-1 text-sm font-semibold capitalize text-slate-300">
            {game.embedStatus ?? t("partnerGames.play.embed_unknown")}
          </p>
        </div>
      </div>

      {game.description ? (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{game.description}</p>
      ) : null}
    </div>
  );
}
