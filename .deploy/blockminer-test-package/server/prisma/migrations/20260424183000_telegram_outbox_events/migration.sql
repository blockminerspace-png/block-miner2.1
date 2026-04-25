CREATE TABLE IF NOT EXISTS "telegram_outbox_events" (
  "id" SERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "transaction_id" INTEGER,
  "user_id" INTEGER,
  "tx_hash" TEXT,
  "amount" DECIMAL(20,8),
  "currency" TEXT NOT NULL DEFAULT 'POL',
  "destination_wallet" TEXT,
  "username_snapshot" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_outbox_events_transaction_id_type_key"
  ON "telegram_outbox_events"("transaction_id", "type");

CREATE INDEX IF NOT EXISTS "telegram_outbox_events_status_next_run_at_idx"
  ON "telegram_outbox_events"("status", "next_run_at");

CREATE INDEX IF NOT EXISTS "telegram_outbox_events_type_idx"
  ON "telegram_outbox_events"("type");

CREATE INDEX IF NOT EXISTS "telegram_outbox_events_transaction_id_idx"
  ON "telegram_outbox_events"("transaction_id");

CREATE INDEX IF NOT EXISTS "telegram_outbox_events_user_id_idx"
  ON "telegram_outbox_events"("user_id");

CREATE INDEX IF NOT EXISTS "telegram_outbox_events_created_at_idx"
  ON "telegram_outbox_events"("created_at");
