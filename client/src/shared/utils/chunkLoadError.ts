const CHUNK_RELOAD_KEY = 'blockminer:chunk-reload-at';
const LEGACY_CHUNK_KEY = 'bm_chunk_reload_v1';
const LEGACY_ASSET_KEY = 'bm_asset_reload_v1';

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
    message.includes('ChunkLoadError') ||
    message.includes('Loading chunk') ||
    message.includes('dynamically imported module')
  );
}

export function shouldAutoReloadChunkError(now = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (raw) {
      const previous = Number(raw);
      if (Number.isFinite(previous) && now - previous < 60_000) {
        return false;
      }
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
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

  const url = new URL(window.location.href);
  url.searchParams.set('_bm_build', String(Date.now()));
  window.location.replace(url.toString());
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
