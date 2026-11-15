-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('show', 'season', 'episode');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'new_season';

-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "lastAiredEpisode" INTEGER,
ADD COLUMN     "lastAiredSeason" INTEGER,
ADD COLUMN     "showEnded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ListEntry" ADD COLUMN     "tracking" "TrackingMode";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "season" INTEGER;

-- CreateTable
CREATE TABLE "TvSeason" (
    "showId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "episodeCount" INTEGER NOT NULL,
    "airDate" DATE,
    "coverImageUrl" TEXT,
    "upcoming" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TvSeason_pkey" PRIMARY KEY ("showId","number")
);

-- CreateTable
CREATE TABLE "SeasonProgress" (
    "entryId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "status" "ListStatus" NOT NULL,
    "episodes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SeasonProgress_pkey" PRIMARY KEY ("entryId","season")
);

-- AddForeignKey
ALTER TABLE "TvSeason" ADD CONSTRAINT "TvSeason_showId_fkey" FOREIGN KEY ("showId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonProgress" ADD CONSTRAINT "SeasonProgress_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ListEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- TV shows already on lists start out tracked by season, as new ones are.
UPDATE "ListEntry" SET "tracking" = 'season'
WHERE "mediaItemId" IN (SELECT "id" FROM "MediaItem" WHERE "type" = 'tv' AND "kind" = 'title');
