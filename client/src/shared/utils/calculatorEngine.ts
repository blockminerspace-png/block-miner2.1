/**
 * calculatorEngine.js
 *
 * Pure-function mining reward estimator (POL pool blocks).
 *
 * Defaults mirror `server/src/miningEngine.js` (same as env defaults; server may override via MINING_POL_BLOCK_REWARD / MINING_BLOCK_INTERVAL_MINUTES).
 * Callers can override per-block POL and interval from live `state:update` / socket stats.
 */

/** POL distributed each time a POL-pool block is mined (must match MiningEngine.rewardBase). */
export const DEFAULT_BLOCK_REWARD_POL = 0.3;

/** Minutes between POL blocks (must match MiningEngine.blockDurationMs / 60000). */
export const DEFAULT_BLOCK_INTERVAL_MIN = 10;

/** @deprecated Use DEFAULT_BLOCK_REWARD_POL — kept for older imports */
export const BLOCK_REWARD_POL = DEFAULT_BLOCK_REWARD_POL;

/** @deprecated Use DEFAULT_BLOCK_INTERVAL_MIN */
export const BLOCK_INTERVAL_MIN = DEFAULT_BLOCK_INTERVAL_MIN;

/**
 * @param {number} intervalMin
 */
export function getBlocksRates(intervalMin = DEFAULT_BLOCK_INTERVAL_MIN): {
  blocksPerHour: number;
  blocksPerDay: number;
  blocksPerWeek: number;
  blocksPerMonth: number;
} {
  const m = Number(intervalMin) > 0 ? intervalMin : DEFAULT_BLOCK_INTERVAL_MIN;
  const bph = 60 / m;
  return {
    blocksPerHour: bph,
    blocksPerDay: bph * 24,
    blocksPerWeek: bph * 24 * 7,
    blocksPerMonth: bph * 24 * 30
  };
}

const DEFAULT_RATES = getBlocksRates(DEFAULT_BLOCK_INTERVAL_MIN);

/** @deprecated use getBlocksRates(interval).blocksPerHour */
export const BLOCKS_PER_HOUR = DEFAULT_RATES.blocksPerHour;
/** @deprecated */
export const BLOCKS_PER_DAY = DEFAULT_RATES.blocksPerDay;
/** @deprecated */
export const BLOCKS_PER_WEEK = DEFAULT_RATES.blocksPerWeek;
/** @deprecated */
export const BLOCKS_PER_MONTH = DEFAULT_RATES.blocksPerMonth;

/**
 * @param {number} myHashRate
 * @param {number} networkHashRate
 * @returns {number} Share in [0, 1].
 */
export function calcShare(myHashRate: number, networkHashRate: number): number {
  if (!Number.isFinite(networkHashRate) || networkHashRate <= 0) return 0;
  if (!Number.isFinite(myHashRate) || myHashRate <= 0) return 0;
  return myHashRate / networkHashRate;
}

export interface CalcRewardsOpts {
  blockRewardPol?: number;
  blockIntervalMin?: number;
}

/**
 * @param tokenPrice optional POL→fiat for USD column
 */
export function calcRewards(
  myHashRate: number,
  networkHashRate: number,
  tokenPrice = 0,
  opts: CalcRewardsOpts = {},
) {
  const blockRewardPol =
    Number.isFinite(Number(opts.blockRewardPol)) && Number(opts.blockRewardPol) > 0
      ? Number(opts.blockRewardPol)
      : DEFAULT_BLOCK_REWARD_POL;
  const intervalMin =
    Number.isFinite(Number(opts.blockIntervalMin)) && Number(opts.blockIntervalMin) > 0
      ? Number(opts.blockIntervalMin)
      : DEFAULT_BLOCK_INTERVAL_MIN;

  const share = calcShare(myHashRate, networkHashRate);
  const perBlock = blockRewardPol * share;
  const { blocksPerHour, blocksPerDay, blocksPerWeek, blocksPerMonth } = getBlocksRates(intervalMin);
  const perHour = perBlock * blocksPerHour;
  const perDay = perBlock * blocksPerDay;
  const perWeek = perBlock * blocksPerWeek;
  const perMonth = perBlock * blocksPerMonth;
  const price = Number.isFinite(tokenPrice) && tokenPrice > 0 ? tokenPrice : 0;

  const toUSD = (pol: number): string => (pol * price).toFixed(4);

  return {
    share,
    perBlock,
    perHour,
    perDay,
    perWeek,
    perMonth,
    toUSD,
    blockRewardPol,
    blockIntervalMin: intervalMin,
    blocksPerDay
  };
}

export interface MinerListRow {
  id: number;
  baseHashRate: number;
}

export function calcSelectedHashRate(minerList: MinerListRow[], selection: Record<string, number>): number {
  return Object.entries(selection).reduce((sum, [id, qty]) => {
    const m = minerList.find((x: MinerListRow) => x.id === Number(id));
    const q = typeof qty === 'number' ? qty : Number(qty);
    return sum + (m ? m.baseHashRate * q : 0);
  }, 0);
}
