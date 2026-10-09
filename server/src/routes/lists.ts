import { Router } from 'express'
import type { ListEntry, MediaItem } from '@prisma/client'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { isUniqueConstraintError, prisma } from '../lib/prisma.js'
import { mediaRefSchema, refreshSeries, resolveMediaItem } from '../lib/mediaItems.js'
import { derivedSeriesStatus, withProgress } from '../lib/series.js'

export const listsRouter = Router()

const listStatusSchema = z.enum(['want', 'in_progress', 'done'])

// New entries go on top of the list: a position below every earlier one, without a query to find
// the current minimum. Matches the migration's backfill of existing rows (-addedAt in seconds).
const newEntryPosition = () => -Date.now() / 1000

listsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const entries = await prisma.listEntry.findMany({
      where: { userId },
      include: { mediaItem: true },
      orderBy: { position: 'asc' },
    })
    res.json(await withProgress(entries))
  }),
)

const createEntrySchema = z.object({ status: listStatusSchema.default('want') }).and(mediaRefSchema)

listsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = createEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const mediaItem = await resolveMediaItem(parsed.data)
    if (!mediaItem) {
      res.status(404).json({ error: 'Media item not found' })
      return
    }

    // mediaItem is attached here rather than via `include`, which would turn a single
    // INSERT into a multi-statement transaction (see isUniqueConstraintError in lib/prisma).
    let entry
    try {
      entry = await prisma.listEntry.create({
        data: {
          userId,
          mediaItemId: mediaItem.id,
          status: parsed.data.status,
          completedAt: parsed.data.status === 'done' ? new Date() : null,
          position: newEntryPosition(),
        },
      })
    } catch (error) {
      // Already on the list: return the existing entry, unchanged.
      if (!isUniqueConstraintError(error)) throw error
      entry = await prisma.listEntry.findUniqueOrThrow({
        where: { userId_mediaItemId: { userId, mediaItemId: mediaItem.id } },
      })
    }
    const [withMedia] = await withProgress([{ ...entry, mediaItem }])
    res.status(201).json(withMedia)
  }),
)

const updateEntrySchema = z.object({
  status: listStatusSchema.optional(),
  notes: z.string().nullable().optional(),
  // Set by the client when the entry is dragged: the midpoint of its new neighbours' positions.
  position: z.number().finite().optional(),
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
        position: parsed.data.position,
        completedAt: parsed.data.status === undefined ? undefined : parsed.data.status === 'done' ? new Date() : null,
      },
      include: { mediaItem: true },
    })
    const [withMedia] = await withProgress([entry])
    res.json(withMedia)
  }),
)

// A series entry's volumes in order, each with this user's status for it. Opening a series is
// when its volume list is brought up to date, if it's gone stale (see refreshSeries).
listsRouter.get(
  '/:id/volumes',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const entryId = req.params.id
    const series = await prisma.mediaItem.findFirst({ where: { listEntries: { some: { id: entryId, userId } } } })
    if (!series) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await refreshSeries(series)

    const [volumes, progress] = await Promise.all([
      prisma.seriesVolume.findMany({
        where: { seriesId: series.id },
        include: { volume: true },
        orderBy: { position: 'asc' },
      }),
      prisma.volumeProgress.findMany({ where: { entryId } }),
    ])
    const statusByVolume = new Map(progress.map((row) => [row.volumeId, row.status]))
    res.json(
      volumes.map(({ volume, position }) => ({ ...volume, position, status: statusByVolume.get(volume.id) ?? 'want' })),
    )
  }),
)

// A user's series entry and one of its volumes' link to it, or null if either isn't theirs.
async function findEntryVolume(userId: string, entryId: string, volumeId: string) {
  const [entry, link] = await Promise.all([
    prisma.listEntry.findUnique({ where: { id: entryId }, include: { mediaItem: true } }),
    prisma.seriesVolume.findFirst({
      where: { volumeId, series: { listEntries: { some: { id: entryId, userId } } } },
    }),
  ])
  return entry && entry.userId === userId && link ? { entry, link } : null
}

// After a series entry's volumes change, moves the entry itself along to match (see
// derivedSeriesStatus) and returns it with its progress, as the volume routes respond.
async function syncSeriesStatus(entry: ListEntry & { mediaItem: MediaItem }, seriesId: string) {
  const [total, byStatus] = await Promise.all([
    prisma.seriesVolume.count({ where: { seriesId } }),
    prisma.volumeProgress.groupBy({ by: ['status'], where: { entryId: entry.id }, _count: true }),
  ])
  const done = byStatus.find((row) => row.status === 'done')?._count ?? 0
  const started = byStatus.reduce((sum, row) => sum + row._count, 0)
  const nextStatus = derivedSeriesStatus(entry.status, { total, done, started })

  let updated = entry
  if (nextStatus !== entry.status) {
    const changed = await prisma.listEntry.update({
      where: { id: entry.id },
      data: { status: nextStatus, completedAt: nextStatus === 'done' ? new Date() : null },
    })
    updated = { ...changed, mediaItem: entry.mediaItem }
  }
  return { ...updated, progress: { done, total } }
}

const updateVolumeSchema = z.object({ status: listStatusSchema })

// Sets one volume's status, then moves the series entry along to match.
listsRouter.put(
  '/:id/volumes/:volumeId',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = updateVolumeSchema.safeParse(req.body)
    const volumeId = z.string().uuid().safeParse(req.params.volumeId)
    if (!parsed.success || !volumeId.success) {
      res.status(400).json({ error: (parsed.error ?? volumeId.error)?.flatten() })
      return
    }
    const entryId = req.params.id
    const { status } = parsed.data

    const found = await findEntryVolume(userId, entryId, volumeId.data)
    if (!found) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const { entry, link } = found

    const key = { entryId_volumeId: { entryId, volumeId: link.volumeId } }
    const data = { status, completedAt: status === 'done' ? new Date() : null }
    if (status === 'want') {
      await prisma.volumeProgress.deleteMany({ where: { entryId, volumeId: link.volumeId } })
    } else {
      try {
        await prisma.volumeProgress.create({ data: { entryId, volumeId: link.volumeId, ...data } })
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error
        await prisma.volumeProgress.update({ where: key, data })
      }
    }

    res.json(await syncSeriesStatus(entry, link.seriesId))
  }),
)

// Marks every volume before this one done, for catching up on a series read ahead of the app.
// Volumes already done keep their original completedAt.
listsRouter.post(
  '/:id/volumes/:volumeId/done-before',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const volumeId = z.string().uuid().safeParse(req.params.volumeId)
    if (!volumeId.success) {
      res.status(400).json({ error: volumeId.error.flatten() })
      return
    }
    const entryId = req.params.id

    const found = await findEntryVolume(userId, entryId, volumeId.data)
    if (!found) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const { entry, link } = found

    const earlier = await prisma.seriesVolume.findMany({
      where: { seriesId: link.seriesId, position: { lt: link.position } },
      select: { volumeId: true },
    })
    const volumeIds = earlier.map((volume) => volume.volumeId)
    const completedAt = new Date()
    // Started volumes are updated, untouched ones (no row yet) created: disjoint rows, so in parallel.
    await Promise.all([
      prisma.volumeProgress.updateMany({
        where: { entryId, volumeId: { in: volumeIds }, status: { not: 'done' } },
        data: { status: 'done', completedAt },
      }),
      prisma.volumeProgress.createMany({
        data: volumeIds.map((id) => ({ entryId, volumeId: id, status: 'done' as const, completedAt })),
        skipDuplicates: true,
      }),
    ])

    res.json(await syncSeriesStatus(entry, link.seriesId))
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
