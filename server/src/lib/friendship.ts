import { prisma } from './prisma.js'

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
