CREATE TABLE "ip_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "device_fingerprint" TEXT NOT NULL DEFAULT 'unknown',
    "network_cidr" TEXT,
    "asn" INTEGER,
    "provider_type" TEXT NOT NULL DEFAULT 'unknown',
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "register_count" INTEGER NOT NULL DEFAULT 0,
    "last_user_agent" TEXT,

    CONSTRAINT "ip_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ip_logs_user_id_ip_device_fingerprint_key" ON "ip_logs"("user_id", "ip", "device_fingerprint");
CREATE INDEX "ip_logs_ip_idx" ON "ip_logs"("ip");
CREATE INDEX "ip_logs_network_cidr_idx" ON "ip_logs"("network_cidr");
CREATE INDEX "ip_logs_asn_idx" ON "ip_logs"("asn");
CREATE INDEX "ip_logs_provider_type_idx" ON "ip_logs"("provider_type");
CREATE INDEX "ip_logs_device_fingerprint_idx" ON "ip_logs"("device_fingerprint");
CREATE INDEX "ip_logs_last_seen_idx" ON "ip_logs"("last_seen");

ALTER TABLE "ip_logs"
ADD CONSTRAINT "ip_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
