import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
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

const createRecommendationSchema = z.object({
  toUserId: z.string(),
  mediaItemId: z.string().uuid(),
  message: z.string().max(280).optional(),
})

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

    const recommendation = await prisma.recommendation.create({
      data: {
        fromUserId: userId,
        toUserId: parsed.data.toUserId,
        mediaItemId: parsed.data.mediaItemId,
        message: parsed.data.message,
      },
      include: { fromUser: true, mediaItem: true },
    })
    res.status(201).json(recommendation)
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
