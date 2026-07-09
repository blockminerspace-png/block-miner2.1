-- Partner games: server-side iframe compatibility probe results
ALTER TABLE "partner_games" ADD COLUMN "embed_status" TEXT;
ALTER TABLE "partner_games" ADD COLUMN "embed_block_reason" TEXT;
ALTER TABLE "partner_games" ADD COLUMN "embed_probe" JSONB;
ALTER TABLE "partner_games" ADD COLUMN "embed_probed_at" TIMESTAMP(3);
