/**
 * calculatorEngine.test.js
 *
 * Unit tests for the pure-function mining reward estimator.
 * Run with: npm test (from the client/ directory)
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BLOCK_REWARD_POL,
  DEFAULT_BLOCK_INTERVAL_MIN,
  BLOCK_REWARD_POL,
  BLOCK_INTERVAL_MIN,
  BLOCKS_PER_HOUR,
  BLOCKS_PER_DAY,
  BLOCKS_PER_WEEK,
  BLOCKS_PER_MONTH,
  getBlocksRates,
  calcShare,
  calcRewards,
  calcSelectedHashRate,
} from './calculatorEngine';

describe('constants', () => {
  it('DEFAULT_BLOCK_REWARD_POL matches MiningEngine.rewardBase (0.3)', () => {
    expect(DEFAULT_BLOCK_REWARD_POL).toBe(0.3);
    expect(BLOCK_REWARD_POL).toBe(0.3);
  });

  it('DEFAULT_BLOCK_INTERVAL_MIN is 10', () => {
    expect(DEFAULT_BLOCK_INTERVAL_MIN).toBe(10);
    expect(BLOCK_INTERVAL_MIN).toBe(10);
  });

  it('deprecated BLOCKS_PER_* match 10 min interval', () => {
    expect(BLOCKS_PER_HOUR).toBe(6);
    expect(BLOCKS_PER_DAY).toBe(144);
    expect(BLOCKS_PER_WEEK).toBe(1008);
    expect(BLOCKS_PER_MONTH).toBe(4320);
  });
});

describe('getBlocksRates', () => {
  it('uses 10 min default', () => {
    const r = getBlocksRates(10);
    expect(r.blocksPerHour).toBe(6);
    expect(r.blocksPerDay).toBe(144);
  });

  it('scales blocks per day when interval is 5 min', () => {
    const r = getBlocksRates(5);
    expect(r.blocksPerHour).toBe(12);
    expect(r.blocksPerDay).toBe(288);
  });
});

describe('calcShare', () => {
  it('returns correct share for equal hash rates', () => {
    expect(calcShare(500, 1000)).toBe(0.5);
  });

  it('returns 0 when networkHashRate is 0', () => {
    expect(calcShare(100, 0)).toBe(0);
  });

  it('returns 0 when networkHashRate is negative', () => {
    expect(calcShare(100, -1)).toBe(0);
  });

  it('returns 0 when myHashRate is 0', () => {
    expect(calcShare(0, 1000)).toBe(0);
  });

  it('returns 0 when myHashRate is negative', () => {
    expect(calcShare(-50, 1000)).toBe(0);
  });

  it('returns 0 when networkHashRate is NaN', () => {
    expect(calcShare(100, NaN)).toBe(0);
  });

  it('returns 0 when myHashRate is NaN', () => {
    expect(calcShare(NaN, 1000)).toBe(0);
  });

  it('returns 0 when networkHashRate is Infinity', () => {
    expect(calcShare(100, Infinity)).toBe(0);
  });

  it('handles small share correctly', () => {
    const share = calcShare(1, 10000);
    expect(share).toBeCloseTo(0.0001, 10);
  });

  it('handles whole network ownership', () => {
    expect(calcShare(1000, 1000)).toBe(1);
  });
});

describe('calcRewards', () => {
  const myHash = 150;
  const networkHash = 1000;
  const price = 0.35;

  it('computes share correctly', () => {
    const { share } = calcRewards(myHash, networkHash, price);
    expect(share).toBeCloseTo(0.15, 10);
  });

  it('perBlock equals DEFAULT_BLOCK_REWARD_POL * share', () => {
    const { perBlock, share } = calcRewards(myHash, networkHash, price);
    expect(perBlock).toBeCloseTo(DEFAULT_BLOCK_REWARD_POL * share, 10);
  });

  it('perHour equals perBlock * blocksPerHour (default interval)', () => {
    const { perBlock, perHour } = calcRewards(myHash, networkHash, price);
    const { blocksPerHour } = getBlocksRates(DEFAULT_BLOCK_INTERVAL_MIN);
    expect(perHour).toBeCloseTo(perBlock * blocksPerHour, 10);
  });

  it('perDay equals perBlock * blocksPerDay (default interval)', () => {
    const { perBlock, perDay } = calcRewards(myHash, networkHash, price);
    const { blocksPerDay } = getBlocksRates(DEFAULT_BLOCK_INTERVAL_MIN);
    expect(perDay).toBeCloseTo(perBlock * blocksPerDay, 10);
  });

  it('respects custom block reward and interval', () => {
    const r = calcRewards(100, 1000, 0, { blockRewardPol: 0.15, blockIntervalMin: 5 });
    expect(r.blockRewardPol).toBe(0.15);
    expect(r.blockIntervalMin).toBe(5);
    expect(r.share).toBeCloseTo(0.1, 10);
    expect(r.perBlock).toBeCloseTo(0.015, 10);
    expect(r.blocksPerDay).toBe(288);
  });

  it('toUSD converts POL to USD string with 4 decimals', () => {
    const { toUSD } = calcRewards(myHash, networkHash, price);
    const pol = 10;
    expect(toUSD(pol)).toBe((pol * price).toFixed(4));
  });

  it('toUSD returns "0.0000" when price is 0', () => {
    const { toUSD } = calcRewards(myHash, networkHash, 0);
    expect(toUSD(100)).toBe('0.0000');
  });

  it('toUSD returns "0.0000" when price is negative', () => {
    const { toUSD } = calcRewards(myHash, networkHash, -1);
    expect(toUSD(100)).toBe('0.0000');
  });

  it('toUSD returns "0.0000" when price is NaN', () => {
    const { toUSD } = calcRewards(myHash, networkHash, NaN);
    expect(toUSD(100)).toBe('0.0000');
  });

  it('all rewards are 0 when networkHashRate is 0', () => {
    const r = calcRewards(100, 0, price);
    expect(r.share).toBe(0);
    expect(r.perBlock).toBe(0);
    expect(r.perHour).toBe(0);
    expect(r.perDay).toBe(0);
    expect(r.perWeek).toBe(0);
    expect(r.perMonth).toBe(0);
  });

  it('all rewards are 0 when myHashRate is 0', () => {
    const r = calcRewards(0, networkHash, price);
    expect(r.perBlock).toBe(0);
    expect(r.perDay).toBe(0);
  });

  it('rewards scale linearly with myHashRate', () => {
    const r1 = calcRewards(100, 1000, price);
    const r2 = calcRewards(200, 1000, price);
    expect(r2.perDay).toBeCloseTo(r1.perDay * 2, 10);
  });

  it('tokenPrice defaults to 0 when omitted', () => {
    const { toUSD } = calcRewards(100, 1000);
    expect(toUSD(50)).toBe('0.0000');
  });
});

describe('calcSelectedHashRate', () => {
  const miners = [
    { id: 1, baseHashRate: 100 },
    { id: 2, baseHashRate: 250 },
    { id: 3, baseHashRate: 500 },
  ];

  it('returns 0 for empty selection', () => {
    expect(calcSelectedHashRate(miners, {})).toBe(0);
  });

  it('returns 0 for empty miner list', () => {
    expect(calcSelectedHashRate([], { 1: 2 })).toBe(0);
  });

  it('calculates hash for single miner with qty 1', () => {
    expect(calcSelectedHashRate(miners, { 1: 1 })).toBe(100);
  });

  it('multiplies baseHashRate by quantity', () => {
    expect(calcSelectedHashRate(miners, { 2: 3 })).toBe(750);
  });

  it('sums multiple miners correctly', () => {
    expect(calcSelectedHashRate(miners, { 1: 1, 2: 2, 3: 1 })).toBe(1100);
  });

  it('ignores unknown miner IDs gracefully', () => {
    expect(calcSelectedHashRate(miners, { 99: 5 })).toBe(0);
  });

  it('ignores unknown IDs but includes valid ones', () => {
    expect(calcSelectedHashRate(miners, { 1: 1, 99: 5 })).toBe(100);
  });

  it('handles string keys in selection (from Object.entries)', () => {
    expect(calcSelectedHashRate(miners, { '2': 2 })).toBe(500);
  });
});
