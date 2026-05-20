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

  it('allows only one auto reload within 60 seconds', () => {
    expect(shouldAutoReloadChunkError(1_000)).toBe(true);
    expect(shouldAutoReloadChunkError(2_000)).toBe(false);
    expect(shouldAutoReloadChunkError(61_500)).toBe(true);
  });

  it('forceReloadForNewBuild adds cache-bust query param', () => {
    const replace = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://blockminer.space/dashboard',
      replace,
    } as unknown as Location);

    forceReloadForNewBuild();
    expect(replace).toHaveBeenCalled();
    const url = String(replace.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('_bm_build=');
  });
});
