-- Backfill referred_by from referrals where register created the link but skipped the column.
UPDATE users AS u
SET referred_by = r.referrer_id
FROM referrals AS r
WHERE r.referred_id = u.id
  AND u.referred_by IS NULL;
