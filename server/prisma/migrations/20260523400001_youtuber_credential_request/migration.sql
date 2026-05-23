ALTER TABLE "youtuber_profiles"
  ADD COLUMN IF NOT EXISTS "credential_request_status" TEXT,
  ADD COLUMN IF NOT EXISTS "credential_reject_note"    TEXT;
