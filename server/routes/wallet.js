import express from "express";
import * as walletController from "../controllers/walletController.js";
import * as blkWalletController from "../controllers/blkWalletController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const walletRouter = express.Router();
const walletLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
const blkReadLimiter = createRateLimiter({ windowMs: 60_000, max: 40 });
const blkConvertLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

walletRouter.get("/balance", requireAuth, walletLimiter, walletController.getBalance);
walletRouter.get("/transactions", requireAuth, walletLimiter, walletController.getTransactions);
walletRouter.get("/deposits", requireAuth, walletLimiter, walletController.getDeposits);
walletRouter.get(
  "/ccpayment/deposit-address",
  requireAuth,
  walletLimiter,
  walletController.getCcpaymentWalletDepositAddress
);
walletRouter.get(
  "/ccpayment/status",
  requireAuth,
  walletLimiter,
  walletController.getCcpaymentWalletStatus
);
walletRouter.post("/deposit", requireAuth, walletLimiter, walletController.requestDeposit);
walletRouter.post("/deposit/submit", requireAuth, walletLimiter, walletController.submitDeposit);
walletRouter.get("/deposit/pending", requireAuth, walletLimiter, walletController.getPendingDeposits);
walletRouter.post("/update-address", requireAuth, walletLimiter, walletController.updateAddress);
walletRouter.post("/withdraw", requireAuth, walletLimiter, walletController.requestWithdrawal);
walletRouter.put("/mining-payout-mode", requireAuth, walletLimiter, walletController.setMiningPayoutMode);

walletRouter.get("/blk/economy", requireAuth, blkReadLimiter, blkWalletController.getEconomy);
walletRouter.get("/blk/estimate", requireAuth, blkReadLimiter, blkWalletController.getEstimate);
walletRouter.post("/blk/convert", requireAuth, blkConvertLimiter, blkWalletController.postConvert);

export { walletRouter };
