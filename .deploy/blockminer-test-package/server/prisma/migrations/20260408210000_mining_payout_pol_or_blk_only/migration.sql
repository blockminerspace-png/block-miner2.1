-- Alocação exclusiva: todo o hashrate em POL ou em BLK (remove modo "both")
UPDATE "users" SET "mining_payout_mode" = 'pol' WHERE "mining_payout_mode" = 'both';
ALTER TABLE "users" ALTER COLUMN "mining_payout_mode" SET DEFAULT 'pol';
