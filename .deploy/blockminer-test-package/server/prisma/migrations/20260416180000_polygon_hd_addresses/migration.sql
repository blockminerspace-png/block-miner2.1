-- Per-user Polygon (EVM) deposit addresses from the custodial HD wallet (BIP-44 m/44'/60'/0'/0/i).
CREATE TABLE "polygon_hd_addresses" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "derivation_index" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "derivation_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polygon_hd_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "polygon_hd_addresses_user_id_key" ON "polygon_hd_addresses"("user_id");

CREATE UNIQUE INDEX "polygon_hd_addresses_address_key" ON "polygon_hd_addresses"("address");

ALTER TABLE "polygon_hd_addresses" ADD CONSTRAINT "polygon_hd_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
