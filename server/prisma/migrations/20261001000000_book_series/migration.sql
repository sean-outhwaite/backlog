-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('title', 'series');

-- DropIndex
DROP INDEX "MediaItem_source_type_externalId_key";

-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "kind" "MediaKind" NOT NULL DEFAULT 'title';

-- CreateTable
CREATE TABLE "SeriesVolume" (
    "seriesId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SeriesVolume_pkey" PRIMARY KEY ("seriesId","volumeId")
);

-- CreateTable
CREATE TABLE "VolumeProgress" (
    "entryId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "status" "ListStatus" NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VolumeProgress_pkey" PRIMARY KEY ("entryId","volumeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaItem_source_type_kind_externalId_key" ON "MediaItem"("source", "type", "kind", "externalId");

-- AddForeignKey
ALTER TABLE "SeriesVolume" ADD CONSTRAINT "SeriesVolume_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesVolume" ADD CONSTRAINT "SeriesVolume_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeProgress" ADD CONSTRAINT "VolumeProgress_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ListEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeProgress" ADD CONSTRAINT "VolumeProgress_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

