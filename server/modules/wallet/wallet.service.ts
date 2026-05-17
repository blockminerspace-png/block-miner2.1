import walletModel from "../../models/walletModel.js";

export async function submitWithdrawalRequest(userId: number, amountPol: number, destinationAddress: string) {
  return walletModel.createWithdrawal(userId, amountPol, destinationAddress);
}
