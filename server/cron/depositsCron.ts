import { ethers } from "ethers";
import axios from "axios";
import type { PrismaClient } from "@prisma/client";
import walletModelDefault from "../models/walletModel.js";
import prismaDefault from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { createCronActionRunner } from "./cronActionRunner.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("DepositsCron");

const getPolygonscanKey = (): string =>
  String(process.env.ETHERSCAN_API_KEY || process.env.POLYGONSCAN_API_KEY || "").trim();
const getCheckinReceiver = (): string => String(process.env.CHECKIN_RECEIVER || "").trim();
const getWithdrawalPrivKey = (): string => String(process.env.WITHDRAWAL_PRIVATE_KEY || "").trim();
const getWithdrawalMnemonic = (): string => String(process.env.WITHDRAWAL_MNEMONIC || "").trim();

const runCronAction = createCronActionRunner({ logger, cronName: "DepositsCron" });

let lastActivationTime = 0;
const SCAN_WINDOW_MS = 30 * 60 * 1000;

export function wakeUpScanner(): void {
  lastActivationTime = Date.now();
}

function getHotWalletAddress(): string | null {
  try {
    const mnemonic = getWithdrawalMnemonic();
    const privKey = getWithdrawalPrivKey();
    if (mnemonic) return ethers.Wallet.fromPhrase(mnemonic).address.toLowerCase();
    if (privKey) {
      const key = privKey.trim();
      const formattedKey = key.startsWith("0x") ? key : `0x${key}`;
      return new ethers.Wallet(formattedKey).address.toLowerCase();
    }
  } catch (e: unknown) {
    logger.warn("getHotWalletAddress: invalid withdrawal key or mnemonic", { error: errMsg(e) });
  }
  return null;
}

function getAllowedWallets(): string[] {
  const wallets: string[] = [];
  const checkin = getCheckinReceiver();
  if (checkin) wallets.push(checkin.toLowerCase());
  const hot = getHotWalletAddress();
  if (hot && !wallets.includes(hot)) wallets.push(hot);
  return wallets;
}

type PolygonscanTx = {
  timeStamp?: string;
  to?: string;
  isError?: string;
  value?: string;
  hash?: string;
  from?: string;
};

async function fetchTxs(address: string): Promise<PolygonscanTx[]> {
  const apiKey = getPolygonscanKey();
  if (!apiKey) return [];
  const url = `https://api.etherscan.io/v2/api?chainid=137&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
  try {
    const resp = await axios.get<{ status?: string; result?: PolygonscanTx[] }>(url);
    return resp.data.status === "1" && Array.isArray(resp.data.result) ? resp.data.result : [];
  } catch (e: unknown) {
    logger.error("Polygonscan API error", { address, error: errMsg(e) });
    return [];
  }
}

export type ScanForNewDepositsDeps = {
  prisma?: PrismaClient;
  walletModel?: typeof walletModelDefault;
};

export async function scanForNewDeposits(
  force = false,
  deps: ScanForNewDepositsDeps = {},
): Promise<{ ok: boolean; reason?: string; result?: unknown }> {
  const now = Date.now();
  const db = deps.prisma ?? prismaDefault;
  const model = deps.walletModel ?? walletModelDefault;

  if (!force && now - lastActivationTime > SCAN_WINDOW_MS) {
    return { ok: false, reason: "idle" };
  }

  return await runCronAction({
    action: "scan_api_deposits",
    meta: { trigger: force ? "active_trigger" : "reactive_timer" },
    logStart: force,
    prepare: async () => {
      const wallets = getAllowedWallets();
      if (wallets.length === 0) throw new Error("No monitored wallets configured.");
      return { wallets };
    },
    validate: async (prepared: unknown) => {
      const { wallets } = prepared as { wallets: string[] };
      if (!getPolygonscanKey()) return { ok: false, reason: "missing_api_key" };
      return { ok: true, details: { walletsCount: wallets.length } };
    },
    execute: async (sanitized: unknown) => {
      const { wallets } = sanitized as { wallets: string[] };
      let found = 0;
      const searchTs = Math.floor(Date.now() / 1000) - 12 * 3600;

      for (const wallet of wallets) {
        const txs = await fetchTxs(wallet);
        for (const tx of txs) {
          if (!tx.timeStamp || parseInt(tx.timeStamp, 10) < searchTs) break;
          if (tx.to?.toLowerCase() !== wallet || tx.isError === "1") continue;

          const amount = Number(ethers.formatEther(tx.value || "0"));
          if (amount <= 0 || !tx.hash) continue;

          const existing = await db.transaction.findFirst({
            where: { txHash: tx.hash, type: "deposit" },
          });

          if (!existing) {
            const user = await db.user.findFirst({
              where: { walletAddress: { equals: tx.from, mode: "insensitive" } },
            });

            if (user) {
              try {
                await model.createDepositRequest(user.id, amount, tx.hash);
                found += 1;
                logger.info("Auto-deposit detected", { user: user.username, amount, hash: tx.hash });
              } catch (e: unknown) {
                logger.error("createDepositRequest failed for detected tx", {
                  userId: user.id,
                  hash: tx.hash,
                  error: errMsg(e),
                });
              }
            }
          }
        }
      }
      return { newDepositsFound: found };
    },
  });
}

export function startDepositMonitoring(): ReturnType<typeof setInterval>[] {
  const interval = setInterval(() => {
    scanForNewDeposits().catch((e: unknown) => {
      logger.error("scanForNewDeposits interval error", { error: errMsg(e) });
    });
  }, 60 * 1000);

  wakeUpScanner();
  scanForNewDeposits(true).catch((e: unknown) => {
    logger.error("scanForNewDeposits initial run error", { error: errMsg(e) });
  });

  logger.info("Reactive Deposit Scanner initialized.");
  return [interval];
}

export default {
  startDepositMonitoring,
  scanForNewDeposits,
  wakeUpScanner,
};
