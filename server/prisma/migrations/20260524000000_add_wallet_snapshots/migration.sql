-- CreateTable
CREATE TABLE "transparency_wallet_snapshots" (
    "id"         SERIAL NOT NULL,
    "wallet_id"  INTEGER NOT NULL,
    "total_usd"  DOUBLE PRECISION,
    "value_pol"  DOUBLE PRECISION,
    "chains"     JSONB NOT NULL DEFAULT '[]',
    "tokens"     JSONB NOT NULL DEFAULT '[]',
    "nfts"       JSONB NOT NULL DEFAULT '[]',
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transparency_wallet_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transparency_wallet_snapshots_wallet_id_key"
    ON "transparency_wallet_snapshots"("wallet_id");

-- AddForeignKey
ALTER TABLE "transparency_wallet_snapshots"
    ADD CONSTRAINT "transparency_wallet_snapshots_wallet_id_fkey"
    FOREIGN KEY ("wallet_id")
    REFERENCES "transparency_tracked_wallets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
