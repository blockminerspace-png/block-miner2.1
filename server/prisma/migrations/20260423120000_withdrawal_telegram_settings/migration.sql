CREATE TABLE "withdrawal_telegram_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "private_alerts_enabled" BOOLEAN NOT NULL DEFAULT false,
  "private_bot_token" TEXT,
  "private_chat_id" TEXT,
  "public_proofs_enabled" BOOLEAN NOT NULL DEFAULT false,
  "public_bot_token" TEXT,
  "public_chat_id" TEXT,
  "public_topic_id" TEXT,
  "capture_enabled" BOOLEAN NOT NULL DEFAULT true,
  "browser_executable_path" TEXT,
  "polygonscan_base_url" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "withdrawal_telegram_settings_pkey" PRIMARY KEY ("id")
);
