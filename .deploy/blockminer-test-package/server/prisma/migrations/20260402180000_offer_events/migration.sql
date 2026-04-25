-- CreateTable
CREATE TABLE "offer_events" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_miners" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "price" DECIMAL(20,8) NOT NULL,
    "hash_rate" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'POL',
    "stock_unlimited" BOOLEAN NOT NULL DEFAULT false,
    "stock_count" INTEGER,
    "sold_count" INTEGER NOT NULL DEFAULT 0,
    "slot_size" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_miners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "event_miner_id" INTEGER NOT NULL,
    "price_paid" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offer_events_starts_at_ends_at_idx" ON "offer_events"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "offer_events_is_active_deleted_at_idx" ON "offer_events"("is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "event_miners_event_id_idx" ON "event_miners"("event_id");

-- CreateIndex
CREATE INDEX "event_purchases_user_id_idx" ON "event_purchases"("user_id");

-- CreateIndex
CREATE INDEX "event_purchases_event_id_idx" ON "event_purchases"("event_id");

-- CreateIndex
CREATE INDEX "event_purchases_event_miner_id_idx" ON "event_purchases"("event_miner_id");

-- AddForeignKey
ALTER TABLE "event_miners" ADD CONSTRAINT "event_miners_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "offer_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_purchases" ADD CONSTRAINT "event_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_purchases" ADD CONSTRAINT "event_purchases_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "offer_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_purchases" ADD CONSTRAINT "event_purchases_event_miner_id_fkey" FOREIGN KEY ("event_miner_id") REFERENCES "event_miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
