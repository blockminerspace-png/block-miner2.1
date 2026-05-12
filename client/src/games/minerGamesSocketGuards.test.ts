import { describe, it, expect } from 'vitest';
import {
  createMinerGamesSocketGuard,
  isMinerSocketGameSlug,
} from './minerGamesSocketGuards';

describe('minerGamesSocketGuards', () => {
  it('recognizes allowed slugs', () => {
    expect(isMinerSocketGameSlug('crypto-memory')).toBe(true);
    expect(isMinerSocketGameSlug('cart-rush')).toBe(true);
    expect(isMinerSocketGameSlug('evil')).toBe(false);
    expect(isMinerSocketGameSlug(null)).toBe(false);
  });

  it('blocks parallel start until release', () => {
    const g = createMinerGamesSocketGuard();
    expect(g.tryBeginStart()).toBe(true);
    expect(g.tryBeginStart()).toBe(false);
    g.releaseStart();
    expect(g.tryBeginStart()).toBe(true);
  });

  it('throttles lane emits', () => {
    const g = createMinerGamesSocketGuard({ laneEmitMinMs: 1000 });
    expect(g.tryEmitLane()).toBe(true);
    expect(g.tryEmitLane()).toBe(false);
  });
});
