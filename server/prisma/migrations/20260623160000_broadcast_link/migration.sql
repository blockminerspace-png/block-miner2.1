ALTER TABLE "broadcast_messages"
  ADD COLUMN "link_url"     TEXT,
  ADD COLUMN "link_label"   TEXT,
  ADD COLUMN "link_new_tab" BOOLEAN NOT NULL DEFAULT false;
