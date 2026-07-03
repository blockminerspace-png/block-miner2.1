import { useEffect, useRef } from 'react';
import { api } from '../../store/auth';
import { usePtcSessionStore } from '../../store/ptcSession';

const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Mounted once at the app root. Manages blur/focus detection and server heartbeats
 * for the active PTC session, independent of which page the user is on.
 */
export default function PtcSessionManager() {
  const session = usePtcSessionStore((s) => s.session);
  const status = usePtcSessionStore((s) => s.status);
  const isViewing = usePtcSessionStore((s) => s.isViewing);
  const setIsViewing = usePtcSessionStore((s) => s.setIsViewing);
  const setStatus = usePtcSessionStore((s) => s.setStatus);
  const updateAccumulatedMs = usePtcSessionStore((s) => s.updateAccumulatedMs);

  const sessionIdRef = useRef<string | null>(null);
  const isViewingRef = useRef(false);
  const statusRef = useRef(status);

  // Keep refs in sync
  useEffect(() => { sessionIdRef.current = session?.sessionId ?? null; }, [session]);
  useEffect(() => { isViewingRef.current = isViewing; }, [isViewing]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Detect blur/focus — sets isViewing (user is away from BlockMiner)
  useEffect(() => {
    if (!session || ['completed', 'cancelled', 'claimed', 'idle'].includes(status)) return;

    const isTerminal = () => ['completed', 'cancelled', 'claimed'].includes(statusRef.current);

    const startViewing = () => {
      if (isTerminal()) return;
      setIsViewing(true);
    };

    const stopViewing = () => {
      if (isTerminal()) return;
      setIsViewing(false);
    };

    const onBlur = () => startViewing();
    const onFocus = () => stopViewing();
    const onVisibility = () => {
      if (document.hidden) startViewing();
      else stopViewing();
    };

    // Initialise: if already unfocused when effect runs (e.g. after refresh while ad was open)
    if (!document.hasFocus() || document.hidden) startViewing();

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, status]);

  // Send heartbeat every 10s while user is away (isViewing)
  useEffect(() => {
    const sid = session?.sessionId;
    if (!sid || !isViewing || ['completed', 'cancelled', 'claimed', 'idle'].includes(status)) return;

    const sendHeartbeat = async () => {
      try {
        const res = await api.post<{ ok: boolean; status: string; accumulatedMs: number }>(
          `/ptc/session/${sid}/heartbeat`,
        );
        if (res.data.ok) {
          updateAccumulatedMs(res.data.accumulatedMs);
          if (res.data.status === 'completed') setStatus('completed');
          else if (res.data.status === 'cancelled') setStatus('cancelled');
        }
      } catch {
        // network errors are non-fatal; heartbeat will retry next interval
      }
    };

    void sendHeartbeat();
    const id = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, isViewing, status]);

  // When user returns (isViewing → false), send pause to server
  const prevIsViewingRef = useRef(false);
  useEffect(() => {
    const sid = sessionIdRef.current;
    const wasViewing = prevIsViewingRef.current;
    prevIsViewingRef.current = isViewing;

    if (!sid || !wasViewing || isViewing) return;
    if (['completed', 'cancelled', 'claimed', 'idle'].includes(statusRef.current)) return;

    api.post<{ ok: boolean; status: string; accumulatedMs: number }>(`/ptc/session/${sid}/pause`)
      .then((res) => {
        if (res.data.ok) {
          updateAccumulatedMs(res.data.accumulatedMs);
          if (res.data.status === 'completed') setStatus('completed');
        }
      })
      .catch(() => { /* non-fatal */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewing]);

  return null;
}
