-- Every RAWG row was moved onto IGDB (see CLAUDE.md, Games), so rawg is unused. Postgres can't drop
-- an enum value, so the type is recreated without it. Fails, changing nothing, if any rawg row remains.
-- AlterEnum
BEGIN;
CREATE TYPE "MediaSource_new" AS ENUM ('tmdb', 'openlibrary', 'igdb');
ALTER TABLE "MediaItem" ALTER COLUMN "source" TYPE "MediaSource_new" USING ("source"::text::"MediaSource_new");
ALTER TYPE "MediaSource" RENAME TO "MediaSource_old";
ALTER TYPE "MediaSource_new" RENAME TO "MediaSource";
DROP TYPE "MediaSource_old";
COMMIT;

