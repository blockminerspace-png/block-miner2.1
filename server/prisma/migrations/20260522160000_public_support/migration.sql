CREATE TABLE "public_support_tickets" (
    "id" SERIAL NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_by_id" INTEGER,

    CONSTRAINT "public_support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_support_messages" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "author_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "public_support_tickets_guest_email_idx" ON "public_support_tickets"("guest_email");
CREATE INDEX "public_support_tickets_status_idx" ON "public_support_tickets"("status");
CREATE INDEX "public_support_messages_ticket_id_idx" ON "public_support_messages"("ticket_id");

ALTER TABLE "public_support_messages" ADD CONSTRAINT "public_support_messages_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "public_support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
