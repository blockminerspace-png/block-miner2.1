import express from "express";
import { getRequestIp } from "../utils/clientIp.js";
import * as walletController from "../controllers/walletController.js";
import * as blkWalletController from "../controllers/blkWalletController.js";
import * as btcpayDepositController from "../controllers/btcpayDepositController.js";
import { requireAuth } from "../middleware/auth.js";
import { createDistributedRateLimiter } from "../middleware/distributedRateLimit.js";

const walletRouter = express.Router();
const walletLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 10,
  name: "wallet",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});
const blkReadLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 40,
  name: "wallet_blk_read",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});
const blkConvertLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 10,
  name: "wallet_blk_convert",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

walletRouter.get("/balance", requireAuth, walletLimiter, walletController.getBalance);
walletRouter.get("/pol-usd", requireAuth, walletLimiter, walletController.getWalletPolUsdPrice);
walletRouter.get("/transactions", requireAuth, walletLimiter, walletController.getTransactions);
walletRouter.get("/deposits", requireAuth, walletLimiter, walletController.getDeposits);
walletRouter.post("/deposit", requireAuth, walletLimiter, walletController.requestDeposit);
walletRouter.post("/deposit/submit", requireAuth, walletLimiter, walletController.submitDeposit);
walletRouter.post("/deposit/estimate-gas", requireAuth, walletLimiter, walletController.postDepositEstimateGas);
walletRouter.get("/deposit/pending", requireAuth, walletLimiter, walletController.getPendingDeposits);
walletRouter.post("/btcpay/invoice", requireAuth, walletLimiter, btcpayDepositController.postBtcpayInvoice);
walletRouter.get("/btcpay/invoice/:invoiceId", requireAuth, walletLimiter, btcpayDepositController.getBtcpayInvoiceStatus);
walletRouter.post("/update-address", requireAuth, walletLimiter, walletController.updateAddress);
walletRouter.post("/withdraw", requireAuth, walletLimiter, walletController.requestWithdrawal);
walletRouter.put("/mining-payout-mode", requireAuth, walletLimiter, walletController.setMiningPayoutMode);

walletRouter.get("/blk/economy", requireAuth, blkReadLimiter, blkWalletController.getEconomy);
walletRouter.get("/blk/estimate", requireAuth, blkReadLimiter, blkWalletController.getEstimate);
walletRouter.post("/blk/convert", requireAuth, blkConvertLimiter, blkWalletController.postConvert);

export { walletRouter };
