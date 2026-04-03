-- CreateTable
CREATE TABLE "user_rooms" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "room_number" INTEGER NOT NULL,
    "price_paid" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_racks" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "user_miner_id" INTEGER,
    "installed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_racks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_rooms_user_id_idx" ON "user_rooms"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_rooms_user_id_room_number_key" ON "user_rooms"("user_id", "room_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_racks_user_miner_id_key" ON "user_racks"("user_miner_id");

-- CreateIndex
CREATE INDEX "user_racks_user_id_idx" ON "user_racks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_racks_room_id_position_key" ON "user_racks"("room_id", "position");

-- AddForeignKey
ALTER TABLE "user_rooms" ADD CONSTRAINT "user_rooms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_racks" ADD CONSTRAINT "user_racks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_racks" ADD CONSTRAINT "user_racks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "user_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_racks" ADD CONSTRAINT "user_racks_user_miner_id_fkey" FOREIGN KEY ("user_miner_id") REFERENCES "user_miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
