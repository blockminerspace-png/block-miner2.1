import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { handleChunkLoadFailure } from './chunkLoadError';

/** Never resolves — page is navigating away after a stale-chunk reload. */
const RELOADING = new Promise<never>(() => {});

/** Wrap dynamic `import()` so stale post-deploy chunks trigger a cache-busted reload. */
export function importWithChunkRetry<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch((err: unknown) => {
    if (handleChunkLoadFailure(err)) {
      return RELOADING;
    }
    throw err;
  });
}

/** `React.lazy` with automatic reload when a hashed chunk 404s after deploy. */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithChunkRetry(factory));
}
