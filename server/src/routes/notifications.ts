import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'

export const notificationsRouter = Router()

const NOTIFICATION_LIMIT = 30

// The newest notifications, for the bell menu. Only fetched when it's opened.
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const notifications = await prisma.notification.findMany({
      where: { userId },
      include: { actor: { select: { id: true, username: true, avatarUrl: true } }, mediaItem: true },
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATION_LIMIT,
    })
    res.json(notifications)
  }),
)

// Unread counts, by type. Polled on navigation and tab focus, so kept to one query.
notificationsRouter.get(
  '/unread',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const groups = await prisma.notification.groupBy({
      by: ['type'],
      where: { userId, readAt: null },
      _count: true,
    })
    const byType = Object.fromEntries(groups.map((group) => [group.type, group._count]))
    res.json({
      total: groups.reduce((sum, group) => sum + group._count, 0),
      recommendation: byType.recommendation ?? 0,
      released: byType.released ?? 0,
    })
  }),
)

const markReadSchema = z.object({ type: z.enum(['recommendation', 'released']).optional() })

// Marks every unread notification read, or just those of one type.
notificationsRouter.post(
  '/read',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = markReadSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    await prisma.notification.updateMany({
      where: { userId, readAt: null, ...(parsed.data.type && { type: parsed.data.type }) },
      data: { readAt: new Date() },
    })
    res.status(204).end()
  }),
)
