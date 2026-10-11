import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { mediaRefSchema, resolveMediaItem } from '../lib/mediaItems.js'

export const recommendationsRouter = Router()

recommendationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const recommendations = await prisma.recommendation.findMany({
      where: { toUserId: userId },
      include: { fromUser: true, mediaItem: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(recommendations)
  }),
)

const createRecommendationSchema = z
  .object({
    // Deduplicated so a repeated id can't send the same friend two copies.
    toUserIds: z
      .array(z.string())
      .min(1)
      .max(50)
      .transform((ids) => [...new Set(ids)]),
    message: z.string().max(280).optional(),
  })
  .and(mediaRefSchema)

recommendationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = createRecommendationSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    const { toUserIds, message } = parsed.data

    // One query for every recipient, rather than an areFriends round trip each.
    const [friendships, mediaItem, fromUser] = await Promise.all([
      prisma.friendship.findMany({
        where: {
          OR: [
            { userAId: userId, userBId: { in: toUserIds } },
            { userBId: userId, userAId: { in: toUserIds } },
          ],
        },
      }),
      resolveMediaItem(parsed.data),
      prisma.profile.findUniqueOrThrow({ where: { id: userId } }),
    ])

    const friendIds = new Set(friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId)))
    if (toUserIds.some((id) => !friendIds.has(id))) {
      res.status(403).json({ error: 'Not friends with every recipient' })
      return
    }
    if (!mediaItem) {
      res.status(404).json({ error: 'Media item not found' })
      return
    }

    // Separate creates in parallel and the response assembled by hand: createMany and `include`
    // each turn the INSERT into a multi-statement transaction (see isUniqueConstraintError in lib/prisma).
    // Each recipient's notification goes in alongside, since it doesn't reference the recommendation.
    const [recommendations] = await Promise.all([
      Promise.all(
        toUserIds.map((toUserId) =>
          prisma.recommendation.create({
            data: { fromUserId: userId, toUserId, mediaItemId: mediaItem.id, message },
          }),
        ),
      ),
      Promise.all(
        toUserIds.map((toUserId) =>
          prisma.notification.create({
            data: { userId: toUserId, type: 'recommendation', actorId: userId, mediaItemId: mediaItem.id },
          }),
        ),
      ),
    ])
    res.status(201).json(recommendations.map((recommendation) => ({ ...recommendation, fromUser, mediaItem })))
  }),
)

// Dismisses a recommendation sent to you. deleteMany so it's one statement that also checks it's yours.
recommendationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const { count } = await prisma.recommendation.deleteMany({ where: { id: req.params.id, toUserId: userId } })
    if (count === 0) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.status(204).send()
  }),
)
