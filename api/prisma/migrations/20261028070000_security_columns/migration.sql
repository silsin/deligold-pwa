-- Security hardening: add new columns to existing tables.
--
-- This migration is designed to run against a production database that already
-- has all the tables created by an earlier db push. It only adds the columns
-- and indexes introduced by the security-hardening changes; everything else
-- already exists.
--
-- All three new columns are nullable or have a default, so adding them to
-- tables with existing rows is safe and causes no data loss.

-- 1. User.tokenVersion — incremented to instantly revoke all outstanding JWTs.
--    DEFAULT 0 means every existing user starts at version 0, matching the
--    claim that will be embedded in any newly-issued token.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- 2. Wallet.trustedDestinations — JSON array of known withdrawal IBANs.
--    DEFAULT '[]' = no trusted destinations yet (safe starting point).
ALTER TABLE "Wallet" ADD COLUMN "trustedDestinations" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Wallet" ADD COLUMN "destinationsUpdatedAt" DATETIME;

-- 3. Withdrawal.idempotencyKey — client-supplied UUID for duplicate prevention.
--    Nullable: existing rows simply have no key and are treated as legacy.
--    The UNIQUE index only applies to non-NULL values in SQLite, so existing
--    NULL rows do not conflict with each other.
ALTER TABLE "Withdrawal" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");
