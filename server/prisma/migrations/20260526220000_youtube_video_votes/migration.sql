-- CreateTable: YoutubeVideoVote (community like/dislike on approved video submissions)
CREATE TABLE "youtube_video_votes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "youtube_video_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one vote per (user, submission)
CREATE UNIQUE INDEX "youtube_video_votes_user_id_submission_id_key"
    ON "youtube_video_votes"("user_id", "submission_id");

-- CreateIndex: lookups by submission (fetching counts)
CREATE INDEX "youtube_video_votes_submission_id_idx"
    ON "youtube_video_votes"("submission_id");

-- AddForeignKey: user → cascade on user delete
ALTER TABLE "youtube_video_votes"
  ADD CONSTRAINT "youtube_video_votes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: submission → cascade on submission delete
ALTER TABLE "youtube_video_votes"
  ADD CONSTRAINT "youtube_video_votes_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "youtube_video_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
