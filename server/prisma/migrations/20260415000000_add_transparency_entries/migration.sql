-- CreateTable
CREATE TABLE "transparency_entries" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'misc',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT,
    "provider_url" TEXT,
    "amount_usd" DECIMAL(20,2) NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transparency_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transparency_entries_is_active_idx" ON "transparency_entries"("is_active");

-- CreateIndex
CREATE INDEX "transparency_entries_category_idx" ON "transparency_entries"("category");
