-- CreateTable: PartnerGame (curated external games shown in /games)
CREATE TABLE "partner_games" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_image_url" TEXT,
    "iframe_url" TEXT NOT NULL,
    "fallback_url" TEXT,
    "partner_url" TEXT,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: fast lookup for the public listing (visible + ordered)
CREATE INDEX "partner_games_is_visible_sort_order_idx"
    ON "partner_games"("is_visible", "sort_order");

-- CreateTable: PartnerGameVote (community like/dislike on a partner game)
CREATE TABLE "partner_game_votes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "partner_game_id" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_game_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one vote per (user, game)
CREATE UNIQUE INDEX "partner_game_votes_user_id_partner_game_id_key"
    ON "partner_game_votes"("user_id", "partner_game_id");

-- CreateIndex: fast aggregate by game
CREATE INDEX "partner_game_votes_partner_game_id_idx"
    ON "partner_game_votes"("partner_game_id");

-- AddForeignKey
ALTER TABLE "partner_game_votes"
  ADD CONSTRAINT "partner_game_votes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "partner_game_votes"
  ADD CONSTRAINT "partner_game_votes_partner_game_id_fkey"
  FOREIGN KEY ("partner_game_id") REFERENCES "partner_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
