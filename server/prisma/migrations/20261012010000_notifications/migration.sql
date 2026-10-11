-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('recommendation', 'released');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorId" TEXT,
    "mediaItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Recommendations nobody has looked at yet become unread notifications, so the new badge starts
-- out right rather than at zero.
INSERT INTO "Notification" ("id", "userId", "type", "actorId", "mediaItemId", "createdAt")
SELECT gen_random_uuid(), "toUserId", 'recommendation', "fromUserId", "mediaItemId", "createdAt"
FROM "Recommendation"
WHERE "viewedAt" IS NULL;
