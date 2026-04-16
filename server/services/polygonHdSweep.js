import { ethers, HDNodeWallet, isAddress } from "ethers";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("PolygonHdSweep");

/**
 * Sends native POL from each derived HD deposit address to POLYGON_HD_SWEEP_TO_ADDRESS (minus gas).
 * Runs only in processes that hold POLYGON_HD_MNEMONIC (typically the `phd` container).
 * @returns {Promise<{ attempted: number, sent: number, skipped: boolean }>}
 */
export async function sweepHdDepositAddressesOnce() {
  const mnemonic = (process.env.POLYGON_HD_MNEMONIC || "").trim();
  const sweepToRaw = (process.env.POLYGON_HD_SWEEP_TO_ADDRESS || "").trim();
  const rpc = (process.env.POLYGON_RPC_URL || "").trim();
  if (!mnemonic || !sweepToRaw || !rpc) {
    return { attempted: 0, sent: 0, skipped: true };
  }
  if (!isAddress(sweepToRaw)) {
    logger.warn("sweep skipped: invalid POLYGON_HD_SWEEP_TO_ADDRESS");
    return { attempted: 0, sent: 0, skipped: true };
  }
  const sweepTo = ethers.getAddress(sweepToRaw);
  const provider = new ethers.JsonRpcProvider(rpc);
  const rows = await prisma.polygonHdAddress.findMany({
    select: { address: true, derivationPath: true }
  });

  let sent = 0;
  let attempted = 0;
  for (const row of rows) {
    attempted += 1;
    try {
      const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, row.derivationPath);
      const signer = wallet.connect(provider);
      const bal = await provider.getBalance(wallet.address);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? 35n * 10n ** 9n;
      const gasLimit = 21_000n;
      const gasCost = gasPrice * gasLimit;
      if (bal <= gasCost) {
        continue;
      }
      const value = bal - gasCost;
      if (value <= 0n) {
        continue;
      }
      const tx = await signer.sendTransaction({
        to: sweepTo,
        value,
        gasLimit,
        gasPrice
      });
      logger.info("HD sweep broadcast", {
        from: wallet.address,
        to: sweepTo,
        txHash: tx.hash,
        valueWei: value.toString()
      });
      sent += 1;
    } catch (err) {
      logger.warn("HD sweep failed for row", {
        address: row.address,
        error: err.message
      });
    }
  }
  return { attempted, sent, skipped: false };
}
