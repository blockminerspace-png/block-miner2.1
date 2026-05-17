import express from "express";
import { getRequestIp } from "../../utils/clientIp.js";
import * as walletController from "./wallet.controller.js";
import * as blkWalletController from "../../controllers/blkWalletController.js";
import * as btcpayDepositController from "../../controllers/btcpayDepositController.js";
import { requireAuth } from "../../middleware/auth.js";
import { createDistributedRateLimiter } from "../../middleware/distributedRateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import {
  withdrawRequestSchema,
  updateWalletAddressSchema,
  miningPayoutModeSchema,
  postDepositEstimateGasSchema,
} from "./wallet.schemas.js";

export const walletRouter = express.Router();

const walletLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 10,
  name: "wallet",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

const walletReadLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 40,
  name: "wallet_read",
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

walletRouter.get("/balance", requireAuth, walletReadLimiter, walletController.getBalance);
walletRouter.get("/pol-usd", requireAuth, walletReadLimiter, walletController.getWalletPolUsdPrice);
walletRouter.get("/transactions", requireAuth, walletReadLimiter, walletController.getTransactions);
walletRouter.get("/deposits", requireAuth, walletReadLimiter, walletController.getDeposits);
walletRouter.post("/deposit", requireAuth, walletLimiter, walletController.requestDeposit);
walletRouter.post("/deposit/submit", requireAuth, walletLimiter, walletController.submitDeposit);
walletRouter.post(
  "/deposit/estimate-gas",
  requireAuth,
  walletLimiter,
  validateBody(postDepositEstimateGasSchema),
  walletController.postDepositEstimateGas,
);
walletRouter.get("/deposit/pending", requireAuth, walletReadLimiter, walletController.getPendingDeposits);
walletRouter.get("/deposit/hd-address", requireAuth, walletReadLimiter, walletController.getPolygonHdDepositAddress);
walletRouter.post("/btcpay/invoice", requireAuth, walletLimiter, btcpayDepositController.postBtcpayInvoice);
walletRouter.get("/btcpay/invoice/:invoiceId", requireAuth, walletReadLimiter, btcpayDepositController.getBtcpayInvoiceStatus);
walletRouter.post(
  "/update-address",
  requireAuth,
  walletLimiter,
  validateBody(updateWalletAddressSchema),
  walletController.updateAddress,
);
walletRouter.post(
  "/withdraw",
  requireAuth,
  walletLimiter,
  validateBody(withdrawRequestSchema),
  walletController.requestWithdrawal,
);
walletRouter.put(
  "/mining-payout-mode",
  requireAuth,
  walletLimiter,
  validateBody(miningPayoutModeSchema),
  walletController.setMiningPayoutMode,
);

walletRouter.get("/blk/economy", requireAuth, blkReadLimiter, blkWalletController.getEconomy);
walletRouter.get("/blk/estimate", requireAuth, blkReadLimiter, blkWalletController.getEstimate);
walletRouter.post("/blk/convert", requireAuth, blkConvertLimiter, blkWalletController.postConvert);
