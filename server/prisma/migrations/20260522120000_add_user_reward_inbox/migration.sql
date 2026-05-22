-- CreateTable
CREATE TABLE "user_reward_inbox" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "reward_type" TEXT NOT NULL,
    "reward_value" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "miner_id" INTEGER,
    "miner_name" TEXT,
    "miner_image_url" TEXT,
    "slot_size" INTEGER NOT NULL DEFAULT 1,
    "duration_hours" INTEGER,
    "meta_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected_at" TIMESTAMP(3),

    CONSTRAINT "user_reward_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_reward_inbox_user_id_status_idx" ON "user_reward_inbox"("user_id", "status");

-- AddForeignKey
ALTER TABLE "user_reward_inbox" ADD CONSTRAINT "user_reward_inbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
