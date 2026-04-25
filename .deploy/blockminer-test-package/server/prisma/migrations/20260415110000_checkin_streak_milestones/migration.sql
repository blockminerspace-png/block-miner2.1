-- Check-in streak milestones (admin-configurable) and per-user claim log
CREATE TABLE "checkin_streak_milestones" (
    "id" SERIAL NOT NULL,
    "day_threshold" INTEGER NOT NULL,
    "reward_type" TEXT NOT NULL,
    "reward_value" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "validity_days" INTEGER NOT NULL DEFAULT 7,
    "display_title" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkin_streak_milestones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkin_streak_milestones_day_threshold_key" ON "checkin_streak_milestones"("day_threshold");

CREATE TABLE "user_checkin_streak_rewards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "milestone_id" INTEGER NOT NULL,
    "streak_when_claimed" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_checkin_streak_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_checkin_streak_rewards_user_id_milestone_id_key" ON "user_checkin_streak_rewards"("user_id", "milestone_id");

CREATE INDEX "user_checkin_streak_rewards_user_id_idx" ON "user_checkin_streak_rewards"("user_id");

ALTER TABLE "user_checkin_streak_rewards" ADD CONSTRAINT "user_checkin_streak_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_checkin_streak_rewards" ADD CONSTRAINT "user_checkin_streak_rewards_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "checkin_streak_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
