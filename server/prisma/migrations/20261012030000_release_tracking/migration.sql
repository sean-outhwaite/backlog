-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "releaseCheckedAt" TIMESTAMP(3),
ADD COLUMN     "releaseDate" DATE,
ADD COLUMN     "releasePending" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MediaItem_releasePending_idx" ON "MediaItem"("releasePending");


-- Titles stored before release tracking have no release date yet. Any that could still be to
-- come (this year or later, or undated) are queued for the daily check, which fills in their
-- dates. releaseCheckedAt stays null, so one that turns out to be already out isn't announced.
UPDATE "MediaItem"
SET "releasePending" = true
WHERE "kind" = 'title'
  AND ("releaseYear" IS NULL OR "releaseYear" >= EXTRACT(YEAR FROM CURRENT_DATE));
