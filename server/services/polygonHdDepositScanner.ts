/**
 * Polls Polygon (chain 137) for native POL transfers to custodial HD deposit addresses,
 * registers matching txs as pending_verification deposits, then the existing DepositVerifier
 * credits balances after confirmations. PHD / polygonHdSweep consolidates on-chain POL to treasury.
 */
import axios from "axios";
import { ethers } from "ethers";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { getRequiredBlockConfirmations } from "./polygonDepositConfig.js";
import { isPolygonHdFeatureFlagged } from "./polygonHdConfig.js";
import { getSharedPolygonProvider } from "./polygonProvider.js";
import { runDepositVerifier } from "./depositVerifier.js";
import { errMsg, prismaErrCode } from "../types/tsNarrowing.js";

const logger = loggerLib.child("PolygonHdDepositScanner");

function getPolygonscanKey() {
  return (process.env.ETHERSCAN_API_KEY || process.env.POLYGONSCAN_API_KEY || "").trim();
}

function isAutoScanEnabled() {
  if (!isPolygonHdFeatureFlagged()) {
    return false;
  }
  const v = (process.env.POLYGON_HD_AUTO_SCAN || "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

function scanIntervalMs() {
  const raw = parseInt(process.env.POLYGON_HD_DEPOSIT_SCAN_INTERVAL_MS || "300000", 10);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 300_000;
}

function lookbackBlocks() {
  const raw = parseInt(process.env.POLYGON_HD_SCAN_LOOKBACK_BLOCKS || "250000", 10);
  return Number.isFinite(raw) && raw >= 1000 ? raw : 250_000;
}

/**
 * @param {string} address checksummed or hex
 * @param {number} startBlock
 * @param {number} endBlock
 * @returns {Promise<object[]>}
 */
export async function fetchPolygonNativeTxList(address, startBlock, endBlock) {
  const apiKey = getPolygonscanKey();
  if (!apiKey) {
    throw new Error("missing_polygonscan_api_key");
  }
  const url =
    `https://api.etherscan.io/v2/api?chainid=137&module=account&action=txlist` +
    `&address=${encodeURIComponent(address)}&startblock=${startBlock}&endblock=${endBlock}` +
    `&sort=asc&apikey=${encodeURIComponent(apiKey)}`;
  const resp = await axios.get(url, { timeout: 45_000 });
  if (resp.data?.status !== "1") {
    if (resp.data?.message === "No transactions found") {
      return [];
    }
    const msg = typeof resp.data?.message === "string" ? resp.data.message : "txlist_error";
    throw new Error(`polygonscan_txlist:${msg}`);
  }
  return Array.isArray(resp.data.result) ? resp.data.result : [];
}

/**
 * @param {object} tx polygonscan tx row
 * @param {string} addressLower
 */
export function isIncomingNativePolTx(tx, addressLower) {
  if (!tx || tx.isError === "1") {
    return false;
  }
  const to = String(tx.to || "").toLowerCase();
  if (to !== addressLower) {
    return false;
  }
  try {
    const v = BigInt(tx.value || "0");
    return v > 0n;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{ rows: number, created: number, skipped: boolean, reason?: string }>}
 */
export async function runPolygonHdDepositScanOnce() {
  if (!isAutoScanEnabled()) {
    return { rows: 0, created: 0, skipped: true, reason: "feature_off" };
  }
  if (!getPolygonscanKey()) {
    return { rows: 0, created: 0, skipped: true, reason: "missing_polygonscan_api_key" };
  }

  const provider = getSharedPolygonProvider();
  const latest = await provider.getBlockNumber();
  const confs = getRequiredBlockConfirmations();
  const endBlock = Math.max(0, latest - Math.max(0, confs - 1));
  const lookback = lookbackBlocks();

  const addresses = await prisma.polygonHdAddress.findMany({
    select: {
      id: true,
      userId: true,
      address: true,
      lastIncomingScanBlock: true
    }
  });

  let created = 0;

  for (const row of addresses) {
    const addrLower = String(row.address).toLowerCase();
    const startFromCursor =
      row.lastIncomingScanBlock != null ? row.lastIncomingScanBlock + 1 : Math.max(0, endBlock - lookback);
    const startBlock = Math.min(startFromCursor, endBlock);

    if (startBlock > endBlock) {
      await prisma.polygonHdAddress.update({
        where: { id: row.id },
        data: { lastIncomingScanBlock: endBlock }
      });
      continue;
    }

    let txs;
    try {
      txs = await fetchPolygonNativeTxList(row.address, startBlock, endBlock);
    } catch (err: unknown) {
      logger.warn("HD deposit scan txlist failed", {
        userId: row.userId,
        address: row.address,
        error: errMsg(err)
      });
      continue;
    }

    let maxSeenBlock = row.lastIncomingScanBlock ?? startBlock - 1;

    for (const tx of txs) {
      const bn = parseInt(tx.blockNumber, 10);
      if (Number.isFinite(bn)) {
        maxSeenBlock = Math.max(maxSeenBlock, bn);
      }
      if (!isIncomingNativePolTx(tx, addrLower)) {
        continue;
      }
      const hash = String(tx.hash || "").toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(hash)) {
        continue;
      }

      try {
        const inserted = await prisma.$transaction(async (ptx) => {
          const existing = await ptx.transaction.findFirst({
            where: { txHash: hash, type: "deposit" }
          });
          if (existing) {
            return false;
          }
          let valuePol = 0;
          try {
            valuePol = parseFloat(ethers.formatEther(tx.value));
          } catch {
            return false;
          }
          try {
            await ptx.transaction.create({
              data: {
                userId: row.userId,
                type: "deposit",
                amount: Number.isFinite(valuePol) && valuePol > 0 ? String(valuePol) : "0",
                txHash: hash,
                status: "pending_verification",
                verifyAttempts: 0
              }
            });
          } catch (e: unknown) {
            if (prismaErrCode(e) === "P2002") {
              return false;
            }
            throw e;
          }
          return true;
        });
        if (inserted) {
          created += 1;
          logger.info("HD auto-deposit registered", {
            userId: row.userId,
            txHash: hash,
            block: tx.blockNumber
          });
        }
      } catch (err: unknown) {
        logger.warn("HD auto-deposit row create failed", {
          userId: row.userId,
          txHash: hash,
          error: errMsg(err)
        });
      }
    }

    const nextCursor = Math.max(maxSeenBlock, endBlock);
    try {
      await prisma.polygonHdAddress.update({
        where: { id: row.id },
        data: { lastIncomingScanBlock: nextCursor }
      });
    } catch (err: unknown) {
      logger.warn("HD scan cursor update failed", { id: row.id, error: errMsg(err) });
    }
  }

  if (created > 0) {
    await runDepositVerifier().catch(() => {});
  }

  return { rows: addresses.length, created, skipped: false };
}

let _interval: NodeJS.Timeout | null = null;
let _warnedMissingKey = false;

export function startPolygonHdDepositScanner() {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  if (_interval) {
    return;
  }
  const ms = scanIntervalMs();
  const tick = () => {
    runPolygonHdDepositScanOnce()
      .then((r) => {
        if (r.skipped && r.reason === "missing_polygonscan_api_key" && !_warnedMissingKey) {
          _warnedMissingKey = true;
          logger.warn(
            "Polygon HD auto-scan disabled: set ETHERSCAN_API_KEY or POLYGONSCAN_API_KEY (same V2 key as other Polygon cron jobs)."
          );
        } else if (!r.skipped && r.created > 0) {
          logger.info("Polygon HD deposit scan finished", { created: r.created, rows: r.rows });
        }
      })
      .catch((err: unknown) => logger.error("Polygon HD deposit scan error", { error: errMsg(err) }));
  };
  tick();
  _interval = setInterval(tick, ms);
  logger.info(`PolygonHdDepositScanner started — interval ${ms}ms`);
}

export default {
  startPolygonHdDepositScanner,
  runPolygonHdDepositScanOnce,
  isIncomingNativePolTx
};
