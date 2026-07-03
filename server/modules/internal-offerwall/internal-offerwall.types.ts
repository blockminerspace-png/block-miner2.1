import { Prisma } from "@prisma/client";

export type ParseAdminOfferBodySuccess = {
  ok: true;
  data: Prisma.InternalOfferwallOfferUncheckedCreateInput;
};

export type ParseAdminOfferBodyError = {
  ok: false;
  status: number;
  message: string;
  code?: string;
  details?: { host: string };
};

export type ParseAdminOfferBodyResult = ParseAdminOfferBodySuccess | ParseAdminOfferBodyError;

export type NormalizeTaskMetadataResult =
  | { ok: true; value: Record<string, unknown> | null }
  | { ok: false; message: string; code?: string; host?: string };

export type OfferLimitConfig = {
  resetType: string;
  maxPerPeriod: number;
  cooldownWindowSec: number | null;
};

export type CompletionRow = { periodKey: string; completedAt: Date | null };

export type UsageSnapshot = {
  completedCount: number;
  maxPerPeriod: number;
  resetType: string;
  cooldownWindowSec: number | null;
  secondsUntilAvailable: number | null;
  canStartNew: boolean;
};
