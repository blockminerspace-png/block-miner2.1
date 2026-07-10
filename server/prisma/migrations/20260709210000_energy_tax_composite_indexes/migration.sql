-- Energy Tax: composite indexes for activity/mining period queries.
-- Each query filters (userId, timestamp/status) — single-column userId index forces
-- a full user-row scan on the date range; composite index prunes both in one seek.

-- ZeradsCallback: getActivitiesForPeriod / getMiningRewardsForPeriod use { userId, callbackAt }
CREATE INDEX IF NOT EXISTS "zerads_user_callback_at" ON "zerads_ptc_callbacks" ("user_id", "callback_at");

-- OfferwallMeCallback: queries use { userId, status, createdAt }
CREATE INDEX IF NOT EXISTS "offerwallme_user_status_created_at" ON "offerwallme_callbacks" ("user_id", "status", "created_at");

-- InternalOfferwallAttempt: queries use { userId, status, completedAt }
CREATE INDEX IF NOT EXISTS "internal_offerwall_user_status_completed_at" ON "internal_offerwall_attempts" ("user_id", "status", "completed_at");

-- BlockMinerReward: aggregate uses { userId, createdAt }
CREATE INDEX IF NOT EXISTS "block_miner_rewards_user_created_at" ON "block_miner_rewards" ("user_id", "created_at");

-- UserPowerGame: count uses { userId, playedAt }
CREATE INDEX IF NOT EXISTS "users_powers_games_user_played_at" ON "users_powers_games" ("user_id", "played_at");

-- YoutubeWatchPower: count uses { userId, claimedAt }
CREATE INDEX IF NOT EXISTS "youtube_watch_user_powers_user_claimed_at" ON "youtube_watch_user_powers" ("user_id", "claimed_at");

-- ShortlinkPower: count uses { userId, claimedAt }
CREATE INDEX IF NOT EXISTS "shortlink_powers_user_claimed_at" ON "shortlink_powers" ("user_id", "claimed_at");
