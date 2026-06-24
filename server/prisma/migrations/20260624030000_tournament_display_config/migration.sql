CREATE TABLE "tournament_display_config" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "type_order" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tournament_display_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "tournament_display_config" ("id", "type_order", "updated_at")
VALUES (1, '["MONTHLY","WEEKLY","DAILY","CUSTOM"]'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;
