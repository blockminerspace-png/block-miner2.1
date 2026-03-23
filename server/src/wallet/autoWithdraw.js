import { ethers } from "ethers";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("AutoWithdraw");

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";

export async function processApprovedWithdrawal(withdrawalId) {
    const mnemonic = process.env.WITHDRAWAL_MNEMONIC;
    const privateKey = process.env.WITHDRAWAL_PRIVATE_KEY;

    if (!mnemonic && !privateKey) {
        throw new Error("Hot wallet credentials not configured.");
    }
    
    const withdrawal = await prisma.transaction.findUnique({
        where: { id: withdrawalId }
    });

    if (!withdrawal || withdrawal.status !== 'approved') {
        throw new Error("Withdrawal not found or not in 'approved' state.");
    }
    
    try {
        const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
        
        let wallet;
        if (privateKey) {
            const compact = String(privateKey).trim().replace(/\s+/g, "");
            const normalized = compact.startsWith("0x") ? compact : `0x${compact}`;
            wallet = new ethers.Wallet(normalized).connect(provider);
        } else if (mnemonic) {
            wallet = ethers.Wallet.fromPhrase(String(mnemonic).trim()).connect(provider);
        } else {
             throw new Error("Missing credentials for auto-withdrawal.");
        }
        
        const amountWei = ethers.parseEther(withdrawal.amount.toString());
        
        // 1. Balance and Gas pre-flight check
        const balance = await provider.getBalance(wallet.address);
        const feeData = await provider.getFeeData();
        const estimatedGasLimit = 21000n; // Standard transfer gas limit
        const estimatedGasCost = feeData.maxFeePerGas ? (estimatedGasLimit * feeData.maxFeePerGas) : (estimatedGasLimit * feeData.gasPrice);
        
        const totalCost = amountWei + estimatedGasCost;
        if (balance < totalCost) {
            logger.error(`Insufficient hot wallet balance for withdrawal ${withdrawalId}. Have ${ethers.formatEther(balance)}, need ${ethers.formatEther(totalCost)}`);
            throw new Error("INSUFFICIENT_FUNDS");
        }

        logger.info(`Sending ${withdrawal.amount} POL to ${withdrawal.address}`);

        // 2. Broadcast transaction
        const tx = await wallet.sendTransaction({
            to: withdrawal.address,
            value: amountWei
        });

        // 3. Save txHash before confirmation to avoid losing track if server restarts
        await prisma.transaction.update({
            where: { id: withdrawalId },
            data: { txHash: tx.hash }
        });

        logger.info(`Withdrawal ${withdrawalId} broadcasted. Waiting for confirmation... (txHash: ${tx.hash})`);

        // 4. Wait for 1 confirmation
        await tx.wait(1);

        // 5. Mark as completed
        await prisma.transaction.update({
            where: { id: withdrawalId },
            data: { status: 'completed', completedAt: new Date() }
        });

        logger.info(`Withdrawal ${withdrawalId} confirmed and completed successfully!`);
        return { success: true, txHash: tx.hash };
        
    } catch (error) {
        logger.error(`Failed to process withdrawal ${withdrawalId}`, { error: error.message });
        
        const status = error.message === "INSUFFICIENT_FUNDS" ? 'approved' : 'failed';
        await prisma.transaction.update({
            where: { id: withdrawalId },
            data: { status }
        });
        throw new Error(error.message === "INSUFFICIENT_FUNDS" ? "Insufficient hot wallet funds." : "Transaction failed on-chain.");
    }
}
