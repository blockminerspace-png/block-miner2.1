import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isChunkLoadError,
  shouldAutoReloadChunkError,
  forceReloadForNewBuild,
} from './chunkLoadError';

describe('chunkLoadError', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('detects Failed to fetch dynamically imported module', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://example/assets/x.js')),
    ).toBe(true);
  });

  it('detects ChunkLoadError', () => {
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 9 failed'))).toBe(true);
  });

  it('detects MIME text/html module script errors', () => {
    expect(
      isChunkLoadError(
        new Error(
          "Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\"",
        ),
      ),
    ).toBe(true);
  });

  it('allows up to 3 auto reloads within 120 seconds', () => {
    expect(shouldAutoReloadChunkError(1_000)).toBe(true);
    expect(shouldAutoReloadChunkError(2_000)).toBe(true);
    expect(shouldAutoReloadChunkError(3_000)).toBe(true);
    expect(shouldAutoReloadChunkError(4_000)).toBe(false);
    expect(shouldAutoReloadChunkError(121_500)).toBe(true);
  });

  it('forceReloadForNewBuild adds cache-bust query param', async () => {
    const replace = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')));
    vi.stubGlobal('location', {
      href: 'https://blockminer.space/dashboard',
      pathname: '/dashboard',
      search: '',
      replace: replace,
    } as unknown as Location);

    forceReloadForNewBuild();
    await vi.waitFor(() => expect(replace).toHaveBeenCalled());
    const url = String(replace.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('_bm_build=');
  });
});
