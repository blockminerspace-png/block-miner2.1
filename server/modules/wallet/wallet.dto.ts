import type { Transaction } from "@prisma/client";

/** Transaction row returned to client after a withdrawal request (no internal blobs). */
export type WalletWithdrawalPublicDto = {
  id: number;
  amount: number;
  status: string;
  type: string;
  userId: number;
  createdAt: Date;
  txHash: string | null;
};

export function toWalletWithdrawalPublicDto(tx: Transaction): WalletWithdrawalPublicDto {
  return {
    id: tx.id,
    amount: Number(tx.amount),
    status: tx.status,
    type: tx.type,
    userId: tx.userId,
    createdAt: tx.createdAt,
    txHash: tx.txHash,
  };
}
