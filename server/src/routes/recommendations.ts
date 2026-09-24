import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { mediaRefSchema, resolveMediaItem } from '../lib/mediaItems.js'
import { areFriends } from '../lib/friendship.js'

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
    toUserId: z.string(),
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

    if (!(await areFriends(userId, parsed.data.toUserId))) {
      res.status(403).json({ error: 'Not friends with this user' })
      return
    }

    const mediaItem = await resolveMediaItem(parsed.data)
    if (!mediaItem) {
      res.status(404).json({ error: 'Media item not found' })
      return
    }

    // Run in parallel and assemble the response by hand: `include` would turn the INSERT
    // into a multi-statement transaction (see isUniqueConstraintError in lib/prisma).
    const [recommendation, fromUser] = await Promise.all([
      prisma.recommendation.create({
        data: {
          fromUserId: userId,
          toUserId: parsed.data.toUserId,
          mediaItemId: mediaItem.id,
          message: parsed.data.message,
        },
      }),
      prisma.profile.findUniqueOrThrow({ where: { id: userId } }),
    ])
    res.status(201).json({ ...recommendation, fromUser, mediaItem })
  }),
)

recommendationsRouter.patch(
  '/:id/viewed',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const existing = await prisma.recommendation.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.toUserId !== userId) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const recommendation = await prisma.recommendation.update({
      where: { id: req.params.id },
      data: { viewedAt: new Date() },
    })
    res.json(recommendation)
  }),
)
