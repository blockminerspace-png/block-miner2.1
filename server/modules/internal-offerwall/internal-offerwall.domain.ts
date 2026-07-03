import { getNextDailyTaskResetAt } from "../../services/dailyTasks/dailyTaskPeriod.js";
import {
  OFFER_KIND_PTC_IFRAME,
  RESET_TYPE_COOLDOWN,
  RESET_TYPE_DAILY
} from "./internal-offerwall.config.js";
import type { CompletionRow, OfferLimitConfig, UsageSnapshot } from "./internal-offerwall.types.js";

export function assertMinViewForSubmit({
  offerKind,
  startedAt,
  partnerOpenedAt,
  now,
  minViewSeconds
}: {
  offerKind: string;
  startedAt: Date;
  partnerOpenedAt: Date | null;
  now: Date;
  minViewSeconds: number;
}): { ok: true } | { ok: false; code: string } {
  const isPtc = String(offerKind || "").toUpperCase() === OFFER_KIND_PTC_IFRAME;
  const min = Math.max(0, Number(minViewSeconds) || 0);

  if (isPtc) {
    if (!partnerOpenedAt) {
      return { ok: false, code: "PARTNER_NOT_OPENED" };
    }
    const elapsedSec = (now.getTime() - partnerOpenedAt.getTime()) / 1000;
    if (elapsedSec < min) {
      return { ok: false, code: "MIN_VIEW_NOT_MET" };
    }
    return { ok: true };
  }

  const elapsedSec = (now.getTime() - startedAt.getTime()) / 1000;
  if (elapsedSec < min) {
    return { ok: false, code: "MIN_VIEW_NOT_MET" };
  }
  return { ok: true };
}

export function getOfferLimitConfig(offer: unknown): OfferLimitConfig {
  const meta =
    (offer as { taskMetadata?: unknown })?.taskMetadata &&
    typeof (offer as { taskMetadata?: unknown }).taskMetadata === "object"
      ? ((offer as { taskMetadata: Record<string, unknown> }).taskMetadata)
      : {};
  const rt = String((meta as { resetType?: unknown }).resetType || RESET_TYPE_DAILY)
    .trim()
    .toUpperCase();
  const resetType = rt === RESET_TYPE_COOLDOWN ? RESET_TYPE_COOLDOWN : RESET_TYPE_DAILY;
  const rawMax = Number((offer as { dailyLimitPerUser?: unknown })?.dailyLimitPerUser);
  const maxPerPeriod = Number.isFinite(rawMax) ? Math.min(50, Math.max(1, Math.floor(rawMax))) : 1;
  let cooldownWindowSec: number | null = null;
  if (resetType === RESET_TYPE_COOLDOWN) {
    const n = Math.floor(Number((meta as { cooldownSeconds?: unknown }).cooldownSeconds));
    cooldownWindowSec = Number.isFinite(n) ? Math.min(86400 * 7, Math.max(60, n)) : 3600;
  }
  return { resetType, maxPerPeriod, cooldownWindowSec };
}

export function computeUsageSnapshot(args: {
  resetType: string;
  maxPerPeriod: number;
  cooldownWindowSec: number | null;
  completionRows: CompletionRow[];
  periodKey: string;
  now: Date;
  hasOpenAttempt: boolean;
}): UsageSnapshot {
  const { resetType, maxPerPeriod, cooldownWindowSec, completionRows, periodKey, now, hasOpenAttempt } = args;
  const nowMs = now.getTime();
  let completedCount = 0;
  let secondsUntilAvailable: number | null = null;

  if (resetType === RESET_TYPE_DAILY) {
    completedCount = completionRows.filter((r) => r.periodKey === periodKey).length;
    if (completedCount >= maxPerPeriod && !hasOpenAttempt) {
      const next = getNextDailyTaskResetAt(now);
      secondsUntilAvailable = Math.max(0, Math.ceil((next.getTime() - nowMs) / 1000));
    }
  } else {
    const wMs = (cooldownWindowSec || 3600) * 1000;
    const threshold = nowMs - wMs;
    const inWindow = completionRows
      .filter((r) => r.completedAt && r.completedAt.getTime() >= threshold)
      .map((r) => (r.completedAt as Date).getTime())
      .sort((a, b) => a - b);
    completedCount = inWindow.length;
    if (completedCount >= maxPerPeriod && !hasOpenAttempt) {
      const idx = Math.max(0, inWindow.length - maxPerPeriod);
      const boundary = inWindow[idx] + wMs;
      secondsUntilAvailable = Math.max(0, Math.ceil((boundary - nowMs) / 1000));
    }
  }

  const atLimit = completedCount >= maxPerPeriod;
  const canStartNew = !atLimit || Boolean(hasOpenAttempt);
  return {
    completedCount,
    maxPerPeriod,
    resetType,
    cooldownWindowSec,
    secondsUntilAvailable: canStartNew ? null : secondsUntilAvailable,
    canStartNew
  };
}

export const COMPLETION_HISTORY_LOOKBACK_MS = 8 * 86400000;
