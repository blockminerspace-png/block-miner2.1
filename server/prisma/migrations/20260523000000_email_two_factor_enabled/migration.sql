-- Add email 2FA opt-in flag to users table
ALTER TABLE "users" ADD COLUMN "email_two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
