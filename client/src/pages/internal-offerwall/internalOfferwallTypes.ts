import type { TFunction } from 'i18next';

export type InternalOfferwallTaskMetadata = {
  requiredActions?: string[];
  targetCountryCodes?: string[];
  verificationNote?: string | null;
  externalInfoUrl?: string | null;
};

export type InternalOfferwallUsage = {
  completedCount: number;
  maxPerPeriod: number;
  secondsUntilAvailable: number | null;
  canStartNew: boolean;
};

export type InternalOfferwallOffer = {
  id: number;
  kind?: string | null;
  title: string;
  description?: string | null;
  iframeUrl?: string | null;
  minViewSeconds?: number | null;
  maxExecutionsPerPeriod?: number | null;
  dailyLimitPerUser?: number | null;
  completionMode?: string | null;
  rewardKind?: string | null;
  rewardBlkAmount?: string | number | null;
  rewardPolAmount?: string | number | null;
  rewardHashRate?: number | null;
  rewardHashRateDays?: number | null;
  usage?: Partial<InternalOfferwallUsage> | null;
  taskMetadata?: InternalOfferwallTaskMetadata | null;
};

export type InternalOfferwallAttempt = {
  id: number;
  offerId: number;
  status: string;
  startedAt?: string | null;
  partnerOpenedAt?: string | null;
};

export type InternalOfferwallDailyReset = {
  timezone: string;
  localDate: string;
  nextResetAt: string;
  nextResetInMs: number;
};

export type InternalOfferwallOffersResponse = {
  ok?: boolean;
  code?: string;
  dailyReset?: InternalOfferwallDailyReset;
  offers?: InternalOfferwallOffer[];
  openAttempts?: InternalOfferwallAttempt[];
};

export type InternalOfferwallMutationResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  messageKey?: string;
  secondsUntilReset?: number;
  status?: string;
};

export type InternalOfferwallStatusResponse = {
  enabled?: boolean;
};

/** Narrow alias for reward copy helpers (matches `useTranslation().t`). */
export type IoTranslate = TFunction;
