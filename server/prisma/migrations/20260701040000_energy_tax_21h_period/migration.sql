-- Alinha period_day_starts_at ao início do período de mineração (21h BRT = 00:00 UTC no dia civil).
-- Cobranças antigas usavam meia-noite BRT (T03:00:00Z).

UPDATE energy_tax_charges
SET period_day_starts_at = period_day_starts_at - INTERVAL '3 hours'
WHERE EXTRACT(HOUR FROM period_day_starts_at AT TIME ZONE 'UTC') = 3
  AND EXTRACT(MINUTE FROM period_day_starts_at AT TIME ZONE 'UTC') = 0
  AND EXTRACT(SECOND FROM period_day_starts_at AT TIME ZONE 'UTC') = 0;
