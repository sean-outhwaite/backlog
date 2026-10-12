import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'

export const notificationsRouter = Router()

const listSchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // The id of the last notification on the previous page.
  cursor: z.string().uuid().optional(),
})

// Newest first, a page at a time: the bell menu asks for its few unread ones, the
// notifications page for everything.
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = listSchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    const { unread, limit, cursor } = parsed.data
    // One extra row says whether there's another page.
    const found = await prisma.notification.findMany({
      where: { userId, ...(unread === 'true' && { readAt: null }) },
      include: { actor: { select: { id: true, username: true, avatarUrl: true } }, mediaItem: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })
    const notifications = found.slice(0, limit)
    res.json({ notifications, nextCursor: found.length > limit ? notifications[limit - 1].id : null })
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

const markReadSchema = z.object({
  type: z.enum(['recommendation', 'released']).optional(),
  ids: z.array(z.string().uuid()).max(50).optional(),
})

// Marks every unread notification read, or just those of one type, or just the given ones.
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
      where: {
        userId,
        readAt: null,
        ...(parsed.data.type && { type: parsed.data.type }),
        ...(parsed.data.ids && { id: { in: parsed.data.ids } }),
      },
      data: { readAt: new Date() },
    })
    res.status(204).end()
  }),
)
