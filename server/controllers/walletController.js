import { verifyMessage } from "ethers";
import walletModel from "../models/walletModel.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("WalletController");

export async function getBalance(req, res) {
  try {
    const balance = await walletModel.getUserBalance(req.user.id);
    const depositAddress = process.env.DEPOSIT_WALLET_ADDRESS || null;
    res.json({ ok: true, ...balance, depositAddress });
  } catch (error) {
    logger.error("Error getting balance", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to get balance." });
  }
}

export async function getTransactions(req, res) {
  try {
    const transactions = await walletModel.getTransactions(req.user.id);
    res.json({ ok: true, transactions });
  } catch (error) {
    logger.error("Error getting transactions", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to get transactions." });
  }
}

export async function requestDeposit(req, res) {
  try {
    const { amount, txHash } = req.body;
    if (!amount || !txHash) {
      return res.status(400).json({ ok: false, message: "Amount and TX Hash required." });
    }
    await walletModel.createDepositRequest(req.user.id, amount, txHash);
    res.json({ ok: true, message: "Deposit completed and confirmed." });
  } catch (error) {
    logger.error("Error requesting deposit", { error: error.message });
    res.status(400).json({ ok: false, message: error.message || "Unable to complete deposit." });
  }
}

export async function updateAddress(req, res) {
  try {
    const { walletAddress, signature } = req.body;
    if (!walletAddress || !signature) {
      return res.status(400).json({ ok: false, message: "Wallet address and signature are required." });
    }

    // Verify signature to prevent fraud/spoofing
    const message = `Verify wallet ownership for Block Miner: ${walletAddress}`;
    const recoveredAddress = verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ ok: false, message: "Invalid wallet signature. Ownership not verified." });
    }

    await walletModel.saveWalletAddress(req.user.id, walletAddress);
    res.json({ ok: true, message: "Wallet verified and linked successfully." });
  } catch (error) {
    logger.error("Error updating address", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to verify wallet address." });
  }
}

export async function requestWithdrawal(req, res) {
  try {
    const { amount, address } = req.body;
    if (!amount || !address) {
      return res.status(400).json({ ok: false, message: "Amount and address are required." });
    }
    const transaction = await walletModel.createWithdrawal(req.user.id, amount, address);
    res.json({ ok: true, message: "Withdrawal request created and pending processing.", transaction });
  } catch (error) {
    logger.error("Error requesting withdrawal", { error: error.message });
    if (error.message === "Pending withdrawal exists") {
      return res.status(409).json({ ok: false, message: error.message });
    }
    res.status(400).json({ ok: false, message: error.message || "Unable to request withdrawal." });
  }
}
