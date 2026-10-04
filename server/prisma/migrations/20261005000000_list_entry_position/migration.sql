-- AlterTable: added nullable, backfilled, then made required, so existing rows keep their
-- newest-first order (the same key newEntryPosition uses for new entries).
ALTER TABLE "ListEntry" ADD COLUMN     "position" DOUBLE PRECISION;
UPDATE "ListEntry" SET "position" = -EXTRACT(EPOCH FROM "addedAt");
ALTER TABLE "ListEntry" ALTER COLUMN "position" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ListEntry_userId_position_idx" ON "ListEntry"("userId", "position");
