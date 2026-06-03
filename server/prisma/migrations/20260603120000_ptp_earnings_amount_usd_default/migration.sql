-- Legacy PTP earnings still require amount_usd; ensure inserts without explicit value succeed.
ALTER TABLE "ptp_earnings" ALTER COLUMN "amount_usd" SET DEFAULT 0;
