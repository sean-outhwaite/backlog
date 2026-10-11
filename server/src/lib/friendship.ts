import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

// A subquery of the user's friends' ids (as "id"), for raw queries that need them without a
// separate round trip. A friendship is stored once per pair, either way round.
export function friendIdsSql(userId: string) {
  return Prisma.sql`
    SELECT CASE WHEN "userAId" = ${userId} THEN "userBId" ELSE "userAId" END AS id
    FROM "Friendship"
    WHERE "userAId" = ${userId} OR "userBId" = ${userId}
  `
}

export async function areFriends(userAId: string, userBId: string): Promise<boolean> {
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId, userBId },
        { userAId: userBId, userBId: userAId },
      ],
    },
  })
  return existing !== null
}

export async function createFriendshipIfMissing(userAId: string, userBId: string) {
  if (userAId === userBId) return
  const alreadyFriends = await areFriends(userAId, userBId)
  if (alreadyFriends) return
  await prisma.friendship.create({ data: { userAId, userBId } })
}
