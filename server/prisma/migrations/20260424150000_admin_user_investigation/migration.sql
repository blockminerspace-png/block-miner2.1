ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "related_entity_type" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "related_entity_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_admin_id" INTEGER;

CREATE INDEX IF NOT EXISTS "transactions_type_idx" ON "transactions"("type");
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions"("created_at");
CREATE INDEX IF NOT EXISTS "transactions_address_idx" ON "transactions"("address");
CREATE INDEX IF NOT EXISTS "transactions_from_address_idx" ON "transactions"("from_address");

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "audit_logs_source_idx" ON "audit_logs"("source");
CREATE INDEX IF NOT EXISTS "audit_logs_severity_idx" ON "audit_logs"("severity");
CREATE INDEX IF NOT EXISTS "audit_logs_ip_idx" ON "audit_logs"("ip");
CREATE INDEX IF NOT EXISTS "audit_logs_related_entity_type_related_entity_id_idx" ON "audit_logs"("related_entity_type", "related_entity_id");
CREATE INDEX IF NOT EXISTS "audit_logs_actor_admin_id_idx" ON "audit_logs"("actor_admin_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at");
