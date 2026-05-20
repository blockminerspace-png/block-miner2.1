/**
 * Re-exports check-in calendar helpers (single source of truth in server/modules/checkin/checkin.calendar.ts).
 */
export {
  getCheckinPeriodEndKey as getCheckinPeriodKey,
  getCurrentCheckinPeriod,
  getCheckinPeriodForEndKey as getCheckinPeriodForDate,
  getGraceEndsAt,
  getNextResetAt,
  getPeriodResetAt,
  getPeriodStartAt,
  isCheckinLogInCurrentPeriod,
  isSameCheckinPeriod,
  isWithinGraceForPeriod,
  getCheckinPeriodLookupKeys,
  isPreviousPeriodEndKey,
  periodHasConfirmedKey,
  type CheckinPeriod,
  type CheckinConfig,
} from "../modules/checkin/checkin.calendar.js";
