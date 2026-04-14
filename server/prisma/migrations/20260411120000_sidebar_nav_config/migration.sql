-- User app sidebar: admin-editable visibility, order, parent (Rewards group).

CREATE TABLE "sidebar_nav_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "entries" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sidebar_nav_config_pkey" PRIMARY KEY ("id")
);
