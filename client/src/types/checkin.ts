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
  milestoneDay?: number;
  /** Legacy DB copy — UI must use i18n via rewardType, not this field. */
  displayTitle?: string | null;
  /** Legacy DB copy — UI must use i18n via rewardType, not this field. */
  description?: string | null;
  labelKey?: string | null;
  rewardType?: string;
  rewardValue?: string | number;
  amount?: string | number;
  validityDays?: number | null;
  minerId?: number | null;
  itemCode?: string | null;
  status?: string;
  state?: string;
};

export type CheckinRecentRow = {
  date: string;
  confirmedAt?: string | null;
};

export type CheckinUpcomingMilestone = {
  day: number;
  milestoneDay?: number;
  rewardType: string;
  rewardValue?: number;
  amount?: number;
  itemCode?: string | null;
  minerId?: number | null;
  labelKey?: string;
  /** @deprecated Use labelKey + i18n on the client. */
  label?: string;
};

export type CheckinStatusPayload = {
  ok?: boolean;
  statusDegraded?: boolean;
  cadenceStatus?: { daily: CheckinCadenceDailySlice };
  checkedIn?: boolean;
  todayCheckedIn?: boolean;
  canCheckin?: boolean;
  pending?: boolean;
  failed?: boolean;
  status?: string | null;
  txHash?: string | null;
  streak?: number;
  totalConfirmed?: number;
  recentCheckins?: CheckinRecentRow[];
  walletLinked?: boolean;
  savedWallet?: string | null;
  checkinMode?: 'offchain' | 'onchain' | 'hybrid';
  allowsWalletCheckin?: boolean;
  allowsOffchainCheckin?: boolean;
  nextResetAt?: string;
  graceEndsAt?: string | null;
  upcomingMilestones?: CheckinUpcomingMilestone[];
  paymentRequired?: boolean;
  checkinReceiver?: string | null;
  checkinContractAddress?: string | null;
  checkinAmountWei?: string;
  checkinBalanceAmountWei?: string;
  chainId?: number;
  checkinChainId?: number;
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
