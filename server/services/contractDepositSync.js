import { ethers } from "ethers";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { wakeUpScanner } from "../cron/depositsCron.js";
import { BLOCK_MINER_DEPOSIT_ABI } from "./blockMinerDepositAbi.js";
import { getSharedPolygonProvider } from "./polygonProvider.js";
import { runDepositVerifier } from "./depositVerifier.js";

const logger = loggerLib.child("ContractDepositSync");
const iface = new ethers.Interface(BLOCK_MINER_DEPOSIT_ABI);
const TOPIC0 = iface.getEvent("DepositReceived").topicHash;

const POLL_MS = 15_000;
const DEFAULT_LOOKBACK = 5000n;

let lastScannedBlock = null;
let _interval = null;

function getContractAddress() {
  const a = (process.env.SMART_CONTRACT_ADDRESS || "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : "";
}

/**
 * Polls DepositReceived logs and creates pending_verification rows (idempotent by txHash).
 * Complements manual /wallet/deposit/submit when the user does not call the API.
 */
export async function runContractDepositSyncOnce() {
  const addr = getContractAddress();
  if (!addr) return;

  const provider = getSharedPolygonProvider();
  const latest = BigInt(await provider.getBlockNumber());
  let fromBlock;
  if (lastScannedBlock == null) {
    const envFrom = (process.env.CONTRACT_DEPOSIT_SYNC_FROM_BLOCK || "").trim();
    if (/^\d+$/.test(envFrom)) {
      fromBlock = BigInt(envFrom);
    } else {
      fromBlock = latest > DEFAULT_LOOKBACK ? latest - DEFAULT_LOOKBACK + 1n : 0n;
    }
  } else {
    fromBlock = BigInt(lastScannedBlock) + 1n;
  }

  if (fromBlock > latest) {
    lastScannedBlock = Number(latest);
    return;
  }

  const logs = await provider.getLogs({
    address: addr,
    fromBlock,
    toBlock: latest,
    topics: [TOPIC0]
  });

  for (const log of logs) {
    let parsed;
    try {
      parsed = iface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== "DepositReceived") continue;

    const beneficiary = String(parsed.args.userId);
    const txHash = (log.transactionHash || "").toLowerCase();
    if (!txHash) continue;

    const walletUser = await prisma.user.findFirst({
      where: {
        walletAddress: { equals: beneficiary, mode: "insensitive" }
      },
      select: { id: true }
    });
    if (!walletUser) continue;

    const existing = await prisma.transaction.findFirst({
      where: { txHash, type: "deposit" }
    });
    if (existing) continue;

    try {
      await prisma.transaction.create({
        data: {
          userId: walletUser.id,
          type: "deposit",
          amount: "0",
          txHash,
          status: "pending_verification",
          verifyAttempts: 0
        }
      });
      runDepositVerifier().catch(() => {});
      wakeUpScanner();
      logger.info("Registered contract deposit from chain sync", { txHash, userId: walletUser.id });
    } catch (err) {
      logger.warn("Contract deposit sync insert failed", { txHash, message: err.message });
    }
  }

  lastScannedBlock = Number(latest);
}

export function startContractDepositSync() {
  if (!getContractAddress()) return;
  if (_interval) return;
  runContractDepositSyncOnce().catch((e) => logger.warn("initial sync failed", { message: e.message }));
  _interval = setInterval(() => runContractDepositSyncOnce().catch(() => {}), POLL_MS);
  logger.info(`Started — interval ${POLL_MS}ms`);
}

/** @internal */
export function resetContractDepositSyncForTests() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  lastScannedBlock = null;
}
