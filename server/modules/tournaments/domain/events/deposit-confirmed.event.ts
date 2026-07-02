export type DepositConfirmedPayload = {
  transactionId: number;
  userId: number;
  polAmount: number;
  usdValue: number;
  usdRate: number;
  eventAt: string;
  source: string;
  countsForTournament: boolean;
  txHash: string | null;
};

export const TOURNAMENT_EVENT_DEPOSIT_CONFIRMED = "deposit_confirmed";

export function depositConfirmedIdempotencyKey(transactionId: number): string {
  return `deposit_confirmed:${transactionId}`;
}
