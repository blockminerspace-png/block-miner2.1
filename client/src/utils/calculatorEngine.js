/**
 * calculatorEngine.js
 *
 * Pure-function mining reward estimator.
 *
 * Mirrors the server-side MiningEngine constants:
 *   - rewardBase   = 0.15 POL per block  (server/src/miningEngine.js)
 *   - blockDuration = 10 minutes          (server/src/miningEngine.js)
 *
 * All functions are side-effect-free and depend only on their arguments,
 * making them trivially unit-testable without DOM or network.
 */

/** POL distributed each time a block is mined. */
export const BLOCK_REWARD_POL = 0.15;

/** Minutes between blocks. */
export const BLOCK_INTERVAL_MIN = 10;

/** Derived block-count constants. */
export const BLOCKS_PER_HOUR  = 60 / BLOCK_INTERVAL_MIN;        // 6
export const BLOCKS_PER_DAY   = BLOCKS_PER_HOUR * 24;           // 144
export const BLOCKS_PER_WEEK  = BLOCKS_PER_DAY  * 7;            // 1 008
export const BLOCKS_PER_MONTH = BLOCKS_PER_DAY  * 30;           // 4 320

/**
 * Computes the miner's proportional share of the network hash rate.
 *
 * @param {number} myHashRate      - Miner's own hash rate (H/s). Must be ≥ 0.
 * @param {number} networkHashRate - Total network hash rate (H/s). Must be > 0.
 * @returns {number} Share in [0, 1]. Returns 0 when networkHashRate ≤ 0.
 */
export function calcShare(myHashRate, networkHashRate) {
    if (!Number.isFinite(networkHashRate) || networkHashRate <= 0) return 0;
    if (!Number.isFinite(myHashRate)      || myHashRate      <= 0) return 0;
    return myHashRate / networkHashRate;
}

/**
 * Estimates mining rewards across multiple time windows.
 *
 * @param {number} myHashRate      - Miner's hash rate (H/s).
 * @param {number} networkHashRate - Total network hash rate (H/s).
 * @param {number} tokenPrice      - Current POL price in USD.
 * @returns {{
 *   share:    number,   // fraction of network in [0,1]
 *   perBlock: number,   // POL per mined block
 *   perHour:  number,   // POL per hour
 *   perDay:   number,   // POL per 24 h
 *   perWeek:  number,   // POL per 7 days
 *   perMonth: number,   // POL per 30 days
 *   toUSD: (pol: number) => string   // formatted USD string (4 decimals)
 * }}
 */
export function calcRewards(myHashRate, networkHashRate, tokenPrice = 0) {
    const share    = calcShare(myHashRate, networkHashRate);
    const perBlock = BLOCK_REWARD_POL * share;
    const perHour  = perBlock * BLOCKS_PER_HOUR;
    const perDay   = perBlock * BLOCKS_PER_DAY;
    const perWeek  = perBlock * BLOCKS_PER_WEEK;
    const perMonth = perBlock * BLOCKS_PER_MONTH;
    const price    = Number.isFinite(tokenPrice) && tokenPrice > 0 ? tokenPrice : 0;

    /** @param {number} pol */
    const toUSD = (pol) => (pol * price).toFixed(4);

    return { share, perBlock, perHour, perDay, perWeek, perMonth, toUSD };
}

/**
 * Sums the total hash rate contributed by a selection of shop miners.
 *
 * @param {{ id: number, baseHashRate: number }[]} minerList  - Full shop miners list.
 * @param {Record<number, number>}                 selection  - Map of minerId → quantity.
 * @returns {number} Total hash rate (H/s).
 */
export function calcSelectedHashRate(minerList, selection) {
    return Object.entries(selection).reduce((sum, [id, qty]) => {
        const m = minerList.find(m => m.id === Number(id));
        return sum + (m ? m.baseHashRate * qty : 0);
    }, 0);
}
