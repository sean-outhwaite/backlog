-- DropIndex
DROP INDEX "MediaItem_source_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "MediaItem_source_type_externalId_key" ON "MediaItem"("source", "type", "externalId");

