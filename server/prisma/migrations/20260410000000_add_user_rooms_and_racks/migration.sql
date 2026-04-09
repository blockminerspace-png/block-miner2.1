-- Idempotent: production may already have these tables from `db push` / manual sync.
CREATE TABLE IF NOT EXISTS "user_rooms" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "room_number" INTEGER NOT NULL,
    "price_paid" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_racks" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "user_miner_id" INTEGER,
    "installed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_racks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_rooms_user_id_idx" ON "user_rooms"("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_rooms_user_id_room_number_key" ON "user_rooms"("user_id", "room_number");

CREATE UNIQUE INDEX IF NOT EXISTS "user_racks_user_miner_id_key" ON "user_racks"("user_miner_id");

CREATE INDEX IF NOT EXISTS "user_racks_user_id_idx" ON "user_racks"("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_racks_room_id_position_key" ON "user_racks"("room_id", "position");

DO $$ BEGIN
    ALTER TABLE "user_rooms" ADD CONSTRAINT "user_rooms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_racks" ADD CONSTRAINT "user_racks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_racks" ADD CONSTRAINT "user_racks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "user_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_racks" ADD CONSTRAINT "user_racks_user_miner_id_fkey" FOREIGN KEY ("user_miner_id") REFERENCES "user_miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
