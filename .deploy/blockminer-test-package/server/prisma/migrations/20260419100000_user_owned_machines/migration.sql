-- Canonical machine instance + location (Option B). Idempotent sections for re-run safety.

DO $$ BEGIN
    CREATE TYPE "MachineInstanceLocation" AS ENUM ('INVENTORY', 'RACK', 'WAREHOUSE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user_owned_machines" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "location" "MachineInstanceLocation" NOT NULL,
    "miner_id" INTEGER,
    "miner_name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "hash_rate" DOUBLE PRECISION NOT NULL,
    "slot_size" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_owned_machines_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "user_owned_machines" ADD CONSTRAINT "user_owned_machines_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_owned_machines" ADD CONSTRAINT "user_owned_machines_miner_id_fkey"
      FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "user_owned_machines_user_id_location_idx"
  ON "user_owned_machines"("user_id", "location");

-- Some environments never had a Prisma migration for vault (db push only); create before ALTER/backfill.
CREATE TABLE IF NOT EXISTS "user_vault" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "miner_id" INTEGER,
    "miner_name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "hash_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slot_size" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT,
    "stored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_vault_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_vault_user_id_idx" ON "user_vault"("user_id");

DO $$ BEGIN
    ALTER TABLE "user_vault" ADD CONSTRAINT "user_vault_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_vault" ADD CONSTRAINT "user_vault_miner_id_fkey"
      FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "user_inventory" ADD COLUMN IF NOT EXISTS "owned_machine_id" INTEGER;
ALTER TABLE "user_miners" ADD COLUMN IF NOT EXISTS "owned_machine_id" INTEGER;
ALTER TABLE "user_vault" ADD COLUMN IF NOT EXISTS "owned_machine_id" INTEGER;

DO $$ BEGIN
    ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_owned_machine_id_fkey"
      FOREIGN KEY ("owned_machine_id") REFERENCES "user_owned_machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_miners" ADD CONSTRAINT "user_miners_owned_machine_id_fkey"
      FOREIGN KEY ("owned_machine_id") REFERENCES "user_owned_machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_vault" ADD CONSTRAINT "user_vault_owned_machine_id_fkey"
      FOREIGN KEY ("owned_machine_id") REFERENCES "user_owned_machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "user_inventory_owned_machine_id_key" ON "user_inventory"("owned_machine_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_miners_owned_machine_id_key" ON "user_miners"("owned_machine_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_vault_owned_machine_id_key" ON "user_vault"("owned_machine_id");

-- Backfill: one UserOwnedMachine per existing inventory / miner / vault row (legacy had no pointer).
DO $$
DECLARE r RECORD;
DECLARE new_id INTEGER;
BEGIN
  FOR r IN SELECT * FROM "user_inventory" WHERE "owned_machine_id" IS NULL
  LOOP
    INSERT INTO "user_owned_machines" ("user_id","location","miner_id","miner_name","level","hash_rate","slot_size","image_url","created_at","updated_at")
    VALUES (
      r."user_id",
      'INVENTORY'::"MachineInstanceLocation",
      r."miner_id",
      r."miner_name",
      COALESCE(r."level", 1),
      COALESCE(r."hash_rate", 0),
      COALESCE(r."slot_size", 1),
      r."image_url",
      COALESCE(r."acquired_at", CURRENT_TIMESTAMP),
      COALESCE(r."updated_at", CURRENT_TIMESTAMP)
    )
    RETURNING "id" INTO new_id;
    UPDATE "user_inventory" SET "owned_machine_id" = new_id WHERE "id" = r."id";
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
DECLARE new_id INTEGER;
DECLARE disp_name TEXT;
BEGIN
  FOR r IN SELECT um.*, m."name" AS cat_name FROM "user_miners" um LEFT JOIN "miners" m ON m."id" = um."miner_id" WHERE um."owned_machine_id" IS NULL
  LOOP
    disp_name := COALESCE(r.cat_name, 'Miner');
    INSERT INTO "user_owned_machines" ("user_id","location","miner_id","miner_name","level","hash_rate","slot_size","image_url","created_at","updated_at")
    VALUES (
      r."user_id",
      'RACK'::"MachineInstanceLocation",
      r."miner_id",
      disp_name,
      COALESCE(r."level", 1),
      COALESCE(r."hash_rate", 0),
      COALESCE(r."slot_size", 1),
      r."image_url",
      COALESCE(r."purchased_at", CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    )
    RETURNING "id" INTO new_id;
    UPDATE "user_miners" SET "owned_machine_id" = new_id WHERE "id" = r."id";
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
DECLARE new_id INTEGER;
BEGIN
  FOR r IN SELECT * FROM "user_vault" WHERE "owned_machine_id" IS NULL
  LOOP
    INSERT INTO "user_owned_machines" ("user_id","location","miner_id","miner_name","level","hash_rate","slot_size","image_url","created_at","updated_at")
    VALUES (
      r."user_id",
      'WAREHOUSE'::"MachineInstanceLocation",
      r."miner_id",
      r."miner_name",
      COALESCE(r."level", 1),
      COALESCE(r."hash_rate", 0),
      COALESCE(r."slot_size", 1),
      r."image_url",
      COALESCE(r."stored_at", CURRENT_TIMESTAMP),
      COALESCE(r."updated_at", CURRENT_TIMESTAMP)
    )
    RETURNING "id" INTO new_id;
    UPDATE "user_vault" SET "owned_machine_id" = new_id WHERE "id" = r."id";
  END LOOP;
END $$;
