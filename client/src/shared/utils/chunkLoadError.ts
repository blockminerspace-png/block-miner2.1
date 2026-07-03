const CHUNK_RELOAD_KEY = 'blockminer:chunk-reload-at';
const BUILD_ID_KEY = 'blockminer:bm-build';
const BUILD_RELOADED_KEY = 'blockminer:bm-build-reloaded';
const LEGACY_CHUNK_KEY = 'bm_chunk_reload_v1';
const LEGACY_ASSET_KEY = 'bm_asset_reload_v1';
const CHUNK_RELOAD_MAX = 3;
const CHUNK_RELOAD_WINDOW_MS = 120_000;

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '');

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Expected a JavaScript-or-Wasm module script') ||
    message.includes('MIME type') ||
    message.includes('text/html') ||
    message.includes('ChunkLoadError') ||
    message.includes('Loading chunk') ||
    message.includes('dynamically imported module')
  );
}

export function shouldAutoReloadChunkError(now = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
    let stamps: number[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          stamps = parsed.filter((n) => typeof n === 'number' && Number.isFinite(n));
        } else {
          const previous = Number(raw);
          if (Number.isFinite(previous)) stamps = [previous];
        }
      } catch {
        const previous = Number(raw);
        if (Number.isFinite(previous)) stamps = [previous];
      }
    }
    const recent = stamps.filter((t) => now - t < CHUNK_RELOAD_WINDOW_MS);
    if (recent.length >= CHUNK_RELOAD_MAX) {
      return false;
    }
    recent.push(now);
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify(recent));
    return true;
  } catch {
    return false;
  }
}

export function forceReloadForNewBuild(): void {
  try {
    window.sessionStorage.setItem('blockminer:last-forced-reload', String(Date.now()));
  } catch {
    // ignore storage failure
  }

  const navigate = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('_bm_build', String(Date.now()));
    window.location.replace(url.toString());
  };

  // Bust CDN/browser cache for index.html before navigating (stale shell → stale chunk refs).
  void fetch(`${window.location.pathname}${window.location.search}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })
    .catch(() => {})
    .finally(navigate);
}

export function clearChunkReloadMarkers(): void {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    window.sessionStorage.removeItem(LEGACY_CHUNK_KEY);
    window.sessionStorage.removeItem(LEGACY_ASSET_KEY);
  } catch {
    // ignore storage failure
  }
}

/**
 * After deploy, index.html carries a new bm-build id (entry bundle hash).
 * If the user still runs an old JS bundle, reload once before React mounts.
 * @returns false when a reload was triggered (caller should abort boot).
 */
export function ensureCurrentBuild(): boolean {
  if (typeof document === 'undefined') return true;
  const meta = document.querySelector('meta[name="bm-build"]')?.getAttribute('content');
  if (!meta) return true;
  try {
    const prev = window.localStorage.getItem(BUILD_ID_KEY);
    if (prev && prev !== meta) {
      const alreadyReloaded = window.sessionStorage.getItem(BUILD_RELOADED_KEY);
      if (alreadyReloaded === meta) {
        window.localStorage.setItem(BUILD_ID_KEY, meta);
        return true;
      }
      window.localStorage.setItem(BUILD_ID_KEY, meta);
      window.sessionStorage.setItem(BUILD_RELOADED_KEY, meta);
      clearChunkReloadMarkers();
      forceReloadForNewBuild();
      return false;
    }
    window.localStorage.setItem(BUILD_ID_KEY, meta);
    window.sessionStorage.removeItem(BUILD_RELOADED_KEY);
  } catch {
    return true;
  }
  return true;
}

export function handleChunkLoadFailure(error: unknown): boolean {
  if (!isChunkLoadError(error)) {
    return false;
  }
  if (shouldAutoReloadChunkError()) {
    forceReloadForNewBuild();
    return true;
  }
  return false;
}
