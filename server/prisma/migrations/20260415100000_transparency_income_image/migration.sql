-- AlterTable: add type, income_category, image_url to transparency_entries
ALTER TABLE "transparency_entries"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS "income_category" TEXT,
  ADD COLUMN IF NOT EXISTS "image_url" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transparency_entries_type_idx" ON "transparency_entries"("type");
