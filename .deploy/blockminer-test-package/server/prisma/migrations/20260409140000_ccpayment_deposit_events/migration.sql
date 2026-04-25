-- CCPayment API deposit webhook ledger (idempotent processing by record_id).

CREATE TABLE "ccpayment_deposit_events" (
    "id" SERIAL NOT NULL,
    "record_id" TEXT NOT NULL,
    "order_id" TEXT,
    "user_id" INTEGER,
    "amount_pol" DECIMAL(20,8),
    "tx_hash" TEXT,
    "pay_status" TEXT NOT NULL,
    "credited" BOOLEAN NOT NULL DEFAULT false,
    "reject_reason" TEXT,
    "raw_payload_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ccpayment_deposit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ccpayment_deposit_events_record_id_key" ON "ccpayment_deposit_events"("record_id");

CREATE INDEX "ccpayment_deposit_events_user_id_idx" ON "ccpayment_deposit_events"("user_id");

CREATE INDEX "ccpayment_deposit_events_credited_idx" ON "ccpayment_deposit_events"("credited");

ALTER TABLE "ccpayment_deposit_events" ADD CONSTRAINT "ccpayment_deposit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
