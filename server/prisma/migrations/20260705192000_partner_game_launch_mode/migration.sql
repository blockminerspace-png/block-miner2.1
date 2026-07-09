-- Partner games: iframe vs open-in-new-tab (auth pages / partners that block embed)
ALTER TABLE "partner_games" ADD COLUMN "launch_mode" TEXT NOT NULL DEFAULT 'iframe';

-- MinerCore register affiliate link is not a playable embed
UPDATE "partner_games"
SET "launch_mode" = 'external'
WHERE "iframe_url" ILIKE '%minercore.online%register%'
   OR "iframe_url" ILIKE '%minercore.online%login%'
   OR "iframe_url" ILIKE '%/api/%';

-- Partners known to block cross-origin iframe (frame-ancestors 'self' / X-Frame-Options)
UPDATE "partner_games"
SET "launch_mode" = 'external'
WHERE "slug" IN ('genesis-d-o', 'master-legends');
