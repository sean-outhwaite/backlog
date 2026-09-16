import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'

export const listsRouter = Router()

listsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const entries = await prisma.listEntry.findMany({
      where: { userId },
      include: { mediaItem: true },
      orderBy: { addedAt: 'desc' },
    })
    res.json(entries)
  }),
)

const createEntrySchema = z.object({
  mediaItemId: z.string().uuid(),
  status: z.enum(['want', 'done']).default('want'),
})

listsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = createEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const entry = await prisma.listEntry.upsert({
      where: { userId_mediaItemId: { userId, mediaItemId: parsed.data.mediaItemId } },
      create: {
        userId,
        mediaItemId: parsed.data.mediaItemId,
        status: parsed.data.status,
        completedAt: parsed.data.status === 'done' ? new Date() : null,
      },
      update: {},
      include: { mediaItem: true },
    })
    res.status(201).json(entry)
  }),
)

const updateEntrySchema = z.object({
  status: z.enum(['want', 'done']).optional(),
  notes: z.string().nullable().optional(),
})

listsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = updateEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const existing = await prisma.listEntry.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const entry = await prisma.listEntry.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.status,
        notes: parsed.data.notes,
        completedAt:
          parsed.data.status === undefined
            ? undefined
            : parsed.data.status === 'done'
              ? new Date()
              : null,
      },
      include: { mediaItem: true },
    })
    res.json(entry)
  }),
)

listsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const existing = await prisma.listEntry.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await prisma.listEntry.delete({ where: { id: req.params.id } })
    res.status(204).send()
  }),
)
