/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISCORD_URL?: string;
  readonly VITE_TELEGRAM_URL?: string;
  readonly VITE_TWITTER_URL?: string;
  readonly VITE_YOUTUBE_URL?: string;
  readonly VITE_META_PIXEL_ID?: string;
  readonly VITE_GA_ID?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
