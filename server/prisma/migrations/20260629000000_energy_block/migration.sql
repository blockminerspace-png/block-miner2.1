-- AlterTable
ALTER TABLE "users" ADD COLUMN "energy_blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "energy_blocked_at" TIMESTAMP(3);
