CREATE TABLE "transparency_liquidity_pool_positions" (
  "id" SERIAL NOT NULL,
  "wallet_id" INTEGER NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "chain_name" TEXT NOT NULL,
  "contract_address" TEXT NOT NULL,
  "token_id" TEXT NOT NULL,
  "pool_label" TEXT,
  "name" TEXT,
  "description" TEXT,
  "image_url" TEXT,
  "token_uri" TEXT,
  "explorer_url" TEXT NOT NULL,
  "opensea_url" TEXT NOT NULL,
  "liquidity_usd" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'active',
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "transparency_liquidity_pool_positions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transparency_liquidity_pool_positions_wallet_id_chain_id_contract_address_token_id_key"
ON "transparency_liquidity_pool_positions"("wallet_id", "chain_id", "contract_address", "token_id");

CREATE INDEX "transparency_liquidity_pool_positions_wallet_id_status_chain_id_idx"
ON "transparency_liquidity_pool_positions"("wallet_id", "status", "chain_id");

CREATE INDEX "transparency_liquidity_pool_positions_status_updated_at_idx"
ON "transparency_liquidity_pool_positions"("status", "updated_at");

ALTER TABLE "transparency_liquidity_pool_positions"
ADD CONSTRAINT "transparency_liquidity_pool_positions_wallet_id_fkey"
FOREIGN KEY ("wallet_id") REFERENCES "transparency_tracked_wallets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
