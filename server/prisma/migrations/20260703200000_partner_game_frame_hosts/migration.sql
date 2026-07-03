-- Register partner-game iframe hosts for CSP frame-src
INSERT INTO "internal_offerwall_frame_hosts" ("hostname", "is_active", "created_at")
SELECT DISTINCT host, true, NOW()
FROM (
  SELECT LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(COALESCE("iframe_url", ''), '^https?://([^/:]+).*', '\1'),
      '^www\.', ''
    )
  ) AS host
  FROM "partner_games"
  UNION
  SELECT LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(COALESCE("fallback_url", ''), '^https?://([^/:]+).*', '\1'),
      '^www\.', ''
    )
  ) AS host
  FROM "partner_games"
  UNION
  SELECT LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(COALESCE("partner_url", ''), '^https?://([^/:]+).*', '\1'),
      '^www\.', ''
    )
  ) AS host
  FROM "partner_games"
) AS hosts
WHERE host IS NOT NULL
  AND host <> ''
  AND host ~ '^[a-z0-9.-]+$'
ON CONFLICT ("hostname") DO UPDATE SET "is_active" = true;
