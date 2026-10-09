import { Router } from 'express'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { areFriends } from '../lib/friendship.js'
import { withProgress } from '../lib/series.js'

export const friendsRouter = Router()

friendsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: true, userB: true },
      orderBy: { createdAt: 'desc' },
    })

    const friends = friendships.map((f) => (f.userAId === userId ? f.userB : f.userA))
    res.json(friends)
  }),
)

friendsRouter.get(
  '/:id/list',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const friendId = req.params.id

    if (!(await areFriends(userId, friendId))) {
      res.status(403).json({ error: 'Not friends with this user' })
      return
    }

    // The profile is only for the page's heading; fetched alongside the list so it costs no extra round trip.
    const [friend, entries] = await Promise.all([
      prisma.profile.findUnique({ where: { id: friendId }, select: { id: true, username: true } }),
      prisma.listEntry.findMany({
        where: { userId: friendId },
        include: { mediaItem: true },
        orderBy: { addedAt: 'desc' },
      }),
    ])
    res.json({ friend, entries: await withProgress(entries) })
  }),
)

// Removes the friendship whichever way round it was stored. Recommendations already sent stay.
friendsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const friendId = req.params.id
    const { count } = await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userAId: userId, userBId: friendId },
          { userAId: friendId, userBId: userId },
        ],
      },
    })
    if (count === 0) {
      res.status(404).json({ error: 'Not friends with this user' })
      return
    }
    res.status(204).end()
  }),
)
