import { useCallback, useEffect, useRef, useState } from "react";

export type PartnerPlayerPhase =
  | "loading"
  | "initializing"
  | "connecting"
  | "online"
  | "error";

export type PartnerEmbedStatus =
  | "embeddable"
  | "blocked_x_frame_options"
  | "blocked_frame_ancestors"
  | "blocked_cloudflare"
  | "auth_page"
  | "api_endpoint"
  | "fetch_error"
  | "unknown";

const IFRAME_LOAD_TIMEOUT_MS = 18_000;

export function isEmbeddableLaunch(game: {
  launchMode?: string;
  embedStatus?: string | null;
}): boolean {
  if (game.launchMode === "external") return false;
  if (game.embedStatus && game.embedStatus !== "embeddable") return false;
  return true;
}

export function usePartnerIframe(
  gameId: number | undefined,
  iframeUrl: string | undefined,
  embeddable: boolean,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadedRef = useRef(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    loadedRef.current = false;
    setIframeLoaded(false);
    setLoadTimedOut(false);
    if (!embeddable || !iframeUrl) return undefined;

    const timer = window.setTimeout(() => {
      if (!loadedRef.current) setLoadTimedOut(true);
    }, IFRAME_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [gameId, iframeUrl, embeddable, reloadToken]);

  const onIframeLoad = useCallback(() => {
    loadedRef.current = true;
    setIframeLoaded(true);
    setLoadTimedOut(false);
  }, []);

  const reload = useCallback(() => {
    loadedRef.current = false;
    setIframeLoaded(false);
    setLoadTimedOut(false);
    setReloadToken((n) => n + 1);
    const el = iframeRef.current;
    if (el?.src) {
      el.src = el.src;
    }
  }, []);

  const requestFullscreen = useCallback(() => {
    const el = iframeRef.current?.closest("[data-partner-player-shell]") as HTMLElement | null;
    if (!el) return;
    void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen());
  }, []);

  return {
    iframeRef,
    iframeLoaded,
    loadTimedOut,
    reloadToken,
    onIframeLoad,
    reload,
    requestFullscreen,
  };
}

export function resolvePlayerPhase(input: {
  sessionLoading: boolean;
  gameLoading: boolean;
  embeddable: boolean;
  externalPlayStarted: boolean;
  iframeLoaded: boolean;
  loadTimedOut: boolean;
  embedStatus?: string | null;
}): PartnerPlayerPhase {
  if (input.gameLoading) return "loading";
  if (input.sessionLoading) return "initializing";
  if (!input.embeddable) {
    return input.externalPlayStarted ? "online" : "error";
  }
  if (input.iframeLoaded) return "online";
  if (input.loadTimedOut) return "error";
  return "connecting";
}
