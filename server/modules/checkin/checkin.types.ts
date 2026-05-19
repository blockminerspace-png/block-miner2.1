/** Internal check-in domain types (extend as handlers are split into service/repository). */
export type CheckinPendingRow = {
  id: number;
  userId: number;
  checkinDate: string;
  txHash: string | null;
  status: string;
};
