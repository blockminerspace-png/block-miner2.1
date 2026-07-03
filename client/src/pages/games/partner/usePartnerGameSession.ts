import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../store/auth";

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface PartnerGameDetail {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  iframeUrl: string;
  fallbackUrl: string | null;
  partnerUrl: string | null;
}

export interface PartnerSessionState {
  sessionId: string;
  status: "active" | "paused" | "ended";
  playingSeconds: number;
  hashEarnedSession: number;
  hashEarnedToday: number;
  grantsCount: number;
  nextRewardInMs: number;
  rewardGranted: { hashRate: number } | null;
}

/** Active play = tab visible. Iframe/captcha popups steal window focus but user is still playing. */
function isPlaySessionActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

export function usePartnerGameSession(slug: string | undefined, iframeLoaded: boolean) {
  const [game, setGame] = useState<PartnerGameDetail | null>(null);
  const [session, setSession] = useState<PartnerSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageActive, setPageActive] = useState(isPlaySessionActive);
  const sessionIdRef = useRef<string | null>(null);
  const nextRewardDeadlineRef = useRef<number | null>(null);
  const [nextRewardMs, setNextRewardMs] = useState(60_000);
  const [displayPlayingSeconds, setDisplayPlayingSeconds] = useState(0);

  const applySession = useCallback((next: PartnerSessionState) => {
    setSession(next);
    sessionIdRef.current = next.sessionId;
    setDisplayPlayingSeconds(next.playingSeconds);
    nextRewardDeadlineRef.current = Date.now() + next.nextRewardInMs;
    setNextRewardMs(next.nextRewardInMs);
  }, []);

  const sendHeartbeat = useCallback(
    async (active: boolean) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return null;
      const res = await api.post<{ ok: boolean; session: PartnerSessionState }>(
        `/partner-games/session/${sessionId}/heartbeat`,
        { active, iframeLoaded },
      );
      if (res.data.ok) {
        applySession(res.data.session);
        return res.data.session;
      }
      return null;
    },
    [applySession, iframeLoaded],
  );

  useEffect(() => {
    if (!slug) return undefined;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [gameRes, startRes] = await Promise.all([
          api.get<{ ok: boolean; game: PartnerGameDetail }>(`/partner-games/play/${slug}`),
          api.post<{ ok: boolean; game: PartnerGameDetail; sessionId: string } & PartnerSessionState>(
            "/partner-games/session/start",
            { slug },
          ),
        ]);
        if (cancelled) return;
        if (!gameRes.data.ok || !startRes.data.ok) {
          setError("not_found");
          return;
        }
        setGame(gameRes.data.game);
        applySession({
          sessionId: startRes.data.sessionId,
          status: startRes.data.status,
          playingSeconds: startRes.data.playingSeconds,
          hashEarnedSession: startRes.data.hashEarnedSession,
          hashEarnedToday: startRes.data.hashEarnedToday,
          grantsCount: startRes.data.grantsCount,
          nextRewardInMs: startRes.data.nextRewardInMs,
          rewardGranted: startRes.data.rewardGranted,
        });
      } catch {
        if (!cancelled) setError("load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, applySession]);

  useEffect(() => {
    const sync = () => setPageActive(isPlaySessionActive());
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    if (!sessionIdRef.current || loading) return undefined;

    const tick = () => {
      void sendHeartbeat(pageActive && iframeLoaded);
    };

    tick();
    const id = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loading, pageActive, iframeLoaded, sendHeartbeat]);

  useEffect(() => {
    if (!sessionIdRef.current) return undefined;
    return () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      void api.post(`/partner-games/session/${sessionId}/end`, { reason: "unmount" });
    };
  }, [slug]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (nextRewardDeadlineRef.current) {
        setNextRewardMs(Math.max(0, nextRewardDeadlineRef.current - Date.now()));
      }
      if (pageActive && iframeLoaded) {
        setDisplayPlayingSeconds((s) => s + 1);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [pageActive, iframeLoaded, session?.status]);

  const isPlaying = pageActive && iframeLoaded && session?.status !== "ended";

  return {
    game,
    session,
    loading,
    error,
    isPlaying,
    pageActive,
    displayPlayingSeconds,
    nextRewardMs,
    lastReward: session?.rewardGranted,
  };
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function formatCountdownMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
