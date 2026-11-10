-- CreateTable
CREATE TABLE "SimilarTitles" (
    "source" "MediaSource" NOT NULL,
    "type" "MediaType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimilarTitles_pkey" PRIMARY KEY ("source","type","externalId")
);

