-- Indexes added to speed up admin analytics aggregations on time-windowed reads.
-- Use IF NOT EXISTS because the same indexes were created CONCURRENTLY on the
-- production VM as an emergency fix before this migration existed.
CREATE INDEX IF NOT EXISTS "block_miner_rewards_created_at_idx" ON "block_miner_rewards" ("created_at");
CREATE INDEX IF NOT EXISTS "referral_earnings_created_at_idx" ON "referral_earnings" ("created_at");
CREATE INDEX IF NOT EXISTS "user_reward_inbox_collected_at_idx" ON "user_reward_inbox" ("collected_at");
