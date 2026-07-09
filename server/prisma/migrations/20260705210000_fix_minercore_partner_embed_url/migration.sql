-- Miner Core: affiliate register URL is not embeddable; use homepage with ref for iframe play.
UPDATE "partner_games"
SET
  "slug" = 'miner-core',
  "title" = 'Miner Core',
  "iframe_url" = 'https://minercore.online/?ref=7F7191F5',
  "partner_url" = 'https://minercore.online/?ref=7F7191F5',
  "fallback_url" = 'https://minercore.online/register?ref=7F7191F5',
  "launch_mode" = 'iframe'
WHERE "iframe_url" ILIKE '%minercore.online%'
   OR "slug" ILIKE '%minercore%';
