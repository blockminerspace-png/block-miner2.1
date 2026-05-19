export const CHECKIN_ERROR = {
  UNAUTHENTICATED: "unauthorized",
  INVALID_TX: "invalid_tx",
  ALREADY_CLAIMED: "already_claimed",
  PAYMENT_REQUIRED: "payment_required",
} as const;

export type CheckinErrorCode = (typeof CHECKIN_ERROR)[keyof typeof CHECKIN_ERROR];
