export {};

declare global {
  namespace YT {
    const PlayerState: {
      ENDED: number;
      PLAYING: number;
      PAUSED: number;
      BUFFERING: number;
      CUED: number;
      UNSTARTED: number;
    };

    class Player {
      constructor(container: HTMLElement | null, options: Record<string, unknown>);
      destroy(): void;
    }
  }

  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: (() => void) | undefined;
  }
}
