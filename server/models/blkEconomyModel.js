import prisma from "../src/db/prisma.js";

const CONFIG_ID = 1;

const DEFAULT_ROW = {
  id: CONFIG_ID,
  polPerBlk: "100",
  convertFeeBps: 500,
  minConvertPol: "50",
  dailyConvertLimitBlk: null,
  convertCooldownSec: 300,
  blkCycleReward: "0.03",
  blkCycleIntervalSec: 600,
  blkCycleActivitySec: 900,
  blkCycleMinHashrate: "0.00000001",
  blkCyclePaused: false,
  blkCycleBoost: "1"
};

export async function getBlkEconomyConfig() {
  let row = await prisma.blkEconomyConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) {
    row = await prisma.blkEconomyConfig.create({ data: DEFAULT_ROW });
  }
  return row;
}

export function serializeBlkConfigPublic(row) {
  return {
    polPerBlk: Number(row.polPerBlk),
    convertFeePercent: row.convertFeeBps / 100,
    convertFeeBps: row.convertFeeBps,
    minConvertPol: Number(row.minConvertPol),
    dailyConvertLimitBlk:
      row.dailyConvertLimitBlk != null ? Number(row.dailyConvertLimitBlk) : null,
    convertCooldownSec: row.convertCooldownSec,
    withdrawable: false,
    blkUsdPegNote: "1 BLK = 1 USD (internal peg, not withdrawable)",
    blkCycleReward: Number(row.blkCycleReward),
    blkCycleIntervalSec: row.blkCycleIntervalSec,
    blkCycleActivitySec: row.blkCycleActivitySec,
    blkCycleMinHashrate: Number(row.blkCycleMinHashrate),
    blkCyclePaused: row.blkCyclePaused,
    blkCycleBoost: Number(row.blkCycleBoost)
  };
}

export async function updateBlkEconomyConfig(patch) {
  const {
    polPerBlk,
    convertFeeBps,
    minConvertPol,
    dailyConvertLimitBlk,
    convertCooldownSec,
    blkCycleReward,
    blkCycleIntervalSec,
    blkCycleActivitySec,
    blkCycleMinHashrate,
    blkCyclePaused,
    blkCycleBoost
  } = patch;

  const data = {};
  if (polPerBlk !== undefined) {
    const n = Number(polPerBlk);
    if (!(n > 0)) throw new Error("polPerBlk must be positive");
    data.polPerBlk = String(n);
  }
  if (convertFeeBps !== undefined) {
    const b = Number(convertFeeBps);
    if (!Number.isInteger(b) || b < 0 || b > 10000) {
      throw new Error("convertFeeBps must be an integer 0–10000");
    }
    data.convertFeeBps = b;
  }
  if (minConvertPol !== undefined) {
    const n = Number(minConvertPol);
    if (!(n > 0)) throw new Error("minConvertPol must be positive");
    data.minConvertPol = String(n);
  }
  if (dailyConvertLimitBlk !== undefined) {
    if (dailyConvertLimitBlk === null || dailyConvertLimitBlk === "") {
      data.dailyConvertLimitBlk = null;
    } else {
      const n = Number(dailyConvertLimitBlk);
      if (!(n > 0)) throw new Error("dailyConvertLimitBlk must be positive or null");
      data.dailyConvertLimitBlk = String(n);
    }
  }
  if (convertCooldownSec !== undefined) {
    const s = Number(convertCooldownSec);
    if (!Number.isInteger(s) || s < 0) throw new Error("convertCooldownSec must be a non-negative integer");
    data.convertCooldownSec = s;
  }
  if (blkCycleReward !== undefined) {
    const n = Number(blkCycleReward);
    if (!(n >= 0)) throw new Error("blkCycleReward must be non-negative");
    data.blkCycleReward = String(n);
  }
  if (blkCycleIntervalSec !== undefined) {
    const s = Number(blkCycleIntervalSec);
    if (!Number.isInteger(s) || s < 60) throw new Error("blkCycleIntervalSec must be integer ≥ 60");
    data.blkCycleIntervalSec = s;
  }
  if (blkCycleActivitySec !== undefined) {
    const s = Number(blkCycleActivitySec);
    if (!Number.isInteger(s) || s < 60) throw new Error("blkCycleActivitySec must be integer ≥ 60");
    data.blkCycleActivitySec = s;
  }
  if (blkCycleMinHashrate !== undefined) {
    const n = Number(blkCycleMinHashrate);
    if (!(n >= 0)) throw new Error("blkCycleMinHashrate must be non-negative");
    data.blkCycleMinHashrate = String(n);
  }
  if (blkCyclePaused !== undefined) {
    data.blkCyclePaused = Boolean(blkCyclePaused);
  }
  if (blkCycleBoost !== undefined) {
    const n = Number(blkCycleBoost);
    if (!(n >= 0)) throw new Error("blkCycleBoost must be non-negative");
    data.blkCycleBoost = String(n);
  }

  await prisma.blkEconomyConfig.upsert({
    where: { id: CONFIG_ID },
    create: { ...DEFAULT_ROW, ...data },
    update: data
  });
  return getBlkEconomyConfig();
}
