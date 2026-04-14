-- Hostnames for internal offerwall iframe CSP + validation (managed in DB).
CREATE TABLE "internal_offerwall_frame_hosts" (
    "id" SERIAL NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_offerwall_frame_hosts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_offerwall_frame_hosts_hostname_key" ON "internal_offerwall_frame_hosts"("hostname");
