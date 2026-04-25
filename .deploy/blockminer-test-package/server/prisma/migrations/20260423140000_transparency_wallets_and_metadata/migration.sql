ALTER TABLE "transparency_entries"
  ADD COLUMN "amount_original" DECIMAL(20,8),
  ADD COLUMN "currency_code" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "fx_rate_usd" DECIMAL(20,8),
  ADD COLUMN "entry_date" TIMESTAMP(3),
  ADD COLUMN "direction" TEXT,
  ADD COLUMN "blockchain" TEXT,
  ADD COLUMN "wallet_address" TEXT,
  ADD COLUMN "tx_hash" TEXT,
  ADD COLUMN "reference_url" TEXT,
  ADD COLUMN "is_on_chain" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "transparency_tracked_wallets" (
  "id" SERIAL NOT NULL,
  "label" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "chain" TEXT NOT NULL DEFAULT 'polygon',
  "asset_symbol" TEXT NOT NULL DEFAULT 'POL',
  "explorer_base_url" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "include_in_totals" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "transparency_tracked_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transparency_tracked_wallets_chain_address_key"
  ON "transparency_tracked_wallets"("chain", "address");

CREATE INDEX "transparency_tracked_wallets_is_active_sort_order_idx"
  ON "transparency_tracked_wallets"("is_active", "sort_order");
