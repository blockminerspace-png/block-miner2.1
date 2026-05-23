-- CreateTable: YoutuberProfile
CREATE TABLE "youtuber_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "channel_name" TEXT NOT NULL,
    "channel_photo" TEXT,
    "channel_url" TEXT,
    "bio" TEXT,
    "is_credentialed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "youtuber_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: YoutubeVideoSubmission
CREATE TABLE "youtube_video_submissions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "video_url" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" INTEGER,
    "review_note" TEXT,
    "reward_miner_id" INTEGER,
    "reward_granted" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    CONSTRAINT "youtube_video_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: YoutuberRewardSettings
CREATE TABLE "youtuber_reward_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "miner_id" INTEGER,
    CONSTRAINT "youtuber_reward_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "youtuber_profiles_user_id_key" ON "youtuber_profiles"("user_id");
CREATE INDEX "youtube_video_submissions_user_id_idx" ON "youtube_video_submissions"("user_id");
CREATE INDEX "youtube_video_submissions_status_idx" ON "youtube_video_submissions"("status");
CREATE INDEX "youtube_video_submissions_submitted_at_idx" ON "youtube_video_submissions"("submitted_at");

-- AddForeignKey
ALTER TABLE "youtuber_profiles" ADD CONSTRAINT "youtuber_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "youtube_video_submissions" ADD CONSTRAINT "youtube_video_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "youtube_video_submissions" ADD CONSTRAINT "youtube_video_submissions_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "youtuber_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "youtube_video_submissions" ADD CONSTRAINT "youtube_video_submissions_reward_miner_id_fkey"
    FOREIGN KEY ("reward_miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "youtuber_reward_settings" ADD CONSTRAINT "youtuber_reward_settings_miner_id_fkey"
    FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
