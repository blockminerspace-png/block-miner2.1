import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "../../../store/auth";
import { usePartnerPageActivity } from "./usePartnerPageActivity";
import { isEmbeddableLaunch } from "./usePartnerIframe";

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
  launchMode?: "iframe" | "external";
  embedStatus?: string | null;
  embedBlockReason?: string | null;
  embedProbedAt?: string | null;
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

export function usePartnerGameSession(
  slug: string | undefined,
  playSurfaceReadyRef: MutableRefObject<boolean>,
) {
  const [game, setGame] = useState<PartnerGameDetail | null>(null);
  const [session, setSession] = useState<PartnerSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { playActive, online, pageVisible } = usePartnerPageActivity();
  const sessionIdRef = useRef<string | null>(null);
  const nextRewardDeadlineRef = useRef<number | null>(null);
  const [nextRewardMs, setNextRewardMs] = useState(60_000);
  const [displayPlayingSeconds, setDisplayPlayingSeconds] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const heartbeatFailCountRef = useRef(0);

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
      const playSurfaceReady = playSurfaceReadyRef.current;
      try {
        const res = await api.post<{ ok: boolean; session: PartnerSessionState }>(
          `/partner-games/session/${sessionId}/heartbeat`,
          { active, playSurfaceReady },
        );
        if (res.data.ok) {
          heartbeatFailCountRef.current = 0;
          setReconnecting(false);
          applySession(res.data.session);
          return res.data.session;
        }
      } catch {
        heartbeatFailCountRef.current += 1;
        setReconnecting(heartbeatFailCountRef.current > 0);
      }
      return null;
    },
    [applySession, playSurfaceReadyRef],
  );

  useEffect(() => {
    if (!slug) return undefined;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setSessionLoading(true);
      setError(null);
      try {
        const gameRes = await api.get<{ ok: boolean; game: PartnerGameDetail }>(
          `/partner-games/play/${slug}`,
        );
        if (cancelled) return;
        if (!gameRes.data.ok) {
          setError("not_found");
          return;
        }
        setGame(gameRes.data.game);

        const startRes = await api.post<
          { ok: boolean; game: PartnerGameDetail; sessionId: string } & PartnerSessionState
        >("/partner-games/session/start", { slug });
        if (cancelled) return;
        if (!startRes.data.ok) {
          setError("session_failed");
          return;
        }
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
        if (!cancelled) {
          setLoading(false);
          setSessionLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, applySession]);

  useEffect(() => {
    if (!sessionIdRef.current || loading) return undefined;

    const tick = () => {
      void sendHeartbeat(playActive && playSurfaceReadyRef.current);
    };

    tick();
    const id = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loading, playActive, sendHeartbeat, playSurfaceReadyRef]);

  useEffect(() => {
    if (!sessionIdRef.current) return undefined;
    const endSession = () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      void api.post(`/partner-games/session/${sessionId}/end`, { reason: "unmount" });
    };
    window.addEventListener("pagehide", endSession);
    window.addEventListener("beforeunload", endSession);
    return () => {
      window.removeEventListener("pagehide", endSession);
      window.removeEventListener("beforeunload", endSession);
      endSession();
    };
  }, [slug]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (nextRewardDeadlineRef.current) {
        setNextRewardMs(Math.max(0, nextRewardDeadlineRef.current - Date.now()));
      }
      if (playActive && playSurfaceReadyRef.current && session?.status === "active") {
        setDisplayPlayingSeconds((s) => s + 1);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [playActive, session?.status, playSurfaceReadyRef]);

  const isPlaying =
    playActive && playSurfaceReadyRef.current && session?.status === "active";

  return {
    game,
    session,
    loading,
    sessionLoading,
    error,
    isPlaying,
    playActive,
    pageVisible,
    online,
    embeddable: game ? isEmbeddableLaunch(game) : false,
    displayPlayingSeconds,
    nextRewardMs,
    lastReward: session?.rewardGranted,
    reconnecting: !online || heartbeatFailCountRef.current > 0,
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
