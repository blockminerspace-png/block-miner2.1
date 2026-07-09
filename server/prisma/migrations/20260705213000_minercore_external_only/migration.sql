-- MinerCore: iframe login redirects to /login/?embed=1 which returns HTTP 500 (blank screen).
UPDATE "partner_games"
SET
  "iframe_url" = 'https://minercore.online/?ref=7F7191F5',
  "partner_url" = 'https://minercore.online/?ref=7F7191F5',
  "fallback_url" = 'https://minercore.online/register?ref=7F7191F5',
  "launch_mode" = 'external',
  "embed_status" = 'auth_page',
  "embed_block_reason" = 'Login do parceiro não funciona dentro do iframe (use Abrir em nova aba).'
WHERE "slug" = 'miner-core'
   OR "iframe_url" ILIKE '%minercore.online%';
