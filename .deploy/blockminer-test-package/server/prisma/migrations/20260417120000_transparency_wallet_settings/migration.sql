-- Singleton row id=1: Polygon wallet shown on /transparency and used for admin on-chain activity.
CREATE TABLE "transparency_wallet_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "address" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transparency_wallet_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "transparency_wallet_settings" ("id", "address", "updated_at")
VALUES (1, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
