-- Cursor for Polygonscan-backed HD incoming native POL scans (per derived address).
ALTER TABLE "polygon_hd_addresses" ADD COLUMN "last_incoming_scan_block" INTEGER;
