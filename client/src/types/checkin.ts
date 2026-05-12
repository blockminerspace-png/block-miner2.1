/** Server shape for `GET /api/checkin/status` when `ok: true`. */
export type CheckinCadenceDailySlice = {
  periodKey: string;
  checkedIn: boolean;
  pending: boolean;
  failed: boolean;
  status: string | null;
  txHash: string | null;
};

export type CheckinMilestoneRow = {
  id: number | string;
  dayThreshold: number;
  displayTitle?: string | null;
  description?: string | null;
  rewardType?: string;
  rewardValue?: string | number;
  validityDays?: number | null;
  state?: string;
};

export type CheckinRecentRow = {
  date: string;
  confirmedAt?: string | null;
};

export type CheckinStatusPayload = {
  ok?: boolean;
  statusDegraded?: boolean;
  cadenceStatus?: { daily: CheckinCadenceDailySlice };
  checkedIn?: boolean;
  pending?: boolean;
  failed?: boolean;
  status?: string | null;
  txHash?: string | null;
  streak?: number;
  totalConfirmed?: number;
  recentCheckins?: CheckinRecentRow[];
  walletLinked?: boolean;
  paymentRequired?: boolean;
  checkinReceiver?: string | null;
  checkinAmountWei?: string;
  checkinBalanceAmountWei?: string;
  chainId?: number;
  rpcConfigured?: boolean;
  milestones?: CheckinMilestoneRow[];
  polBalance?: number;
};

export type CheckinPostPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  status?: string;
  pending?: boolean;
  alreadyCheckedIn?: boolean;
  cadence?: string;
};
