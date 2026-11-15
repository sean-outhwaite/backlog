import { Router } from 'express'
import { waitUntil } from '@vercel/functions'
import type { ListEntry, MediaItem } from '@prisma/client'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { isUniqueConstraintError, prisma } from '../lib/prisma.js'
import { mediaRefSchema, refreshSeries, resolveMediaItem } from '../lib/mediaItems.js'
import { derivedSeriesStatus, withProgress } from '../lib/series.js'
import { isOut, isOutWhere } from '../lib/releases.js'
import { invalidDates, statusDates } from '../lib/entryDates.js'
import { markSeasonsDone, markShowDone, refreshShow } from '../lib/tvSeasons.js'
import {
  airedEpisodes,
  cleanEpisodes,
  isSeasonOut,
  seasonCounts,
  seasonStatusFromEpisodes,
  showProgress,
} from '../lib/tvProgress.js'
import { sendPush } from '../lib/push.js'

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
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }

    const { status } = parsed.data
    const mediaItem = await resolveMediaItem(parsed.data)
    if (!mediaItem) {
      res.status(404).json({ error: 'Media item not found' })
      return
    }
    // A series is never upcoming itself; its unreleased volumes are left out of marking it done.
    if (status !== 'want' && mediaItem.kind !== 'series' && !isOut(mediaItem)) {
      res.status(409).json({ error: "That isn't out yet" })
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
          status,
          ...statusDates({ status: 'want', startedAt: null, completedAt: null }, status),
          position: newEntryPosition(),
          // TV shows start out tracked by season (see TrackingMode).
          tracking: isShow(mediaItem) ? 'season' : null,
        },
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      const key = { userId_mediaItemId: { userId, mediaItemId: mediaItem.id } }
      // Already on the list: a plain add leaves it as it is, but adding it as started or
      // finished moves it there.
      entry = await prisma.listEntry.findUniqueOrThrow({ where: key })
      if (status !== 'want' && status !== entry.status) {
        entry = await prisma.listEntry.update({ where: key, data: { status, ...statusDates(entry, status) } })
      }
    }
    // Finishing a series finishes every volume that's out, so its progress agrees; likewise a
    // show's seasons that are out, when it's tracked by them.
    if (status === 'done' && mediaItem.kind === 'series') await markSeriesDone(entry.id, mediaItem.id)
    if (status === 'done' && entry.tracking && entry.tracking !== 'show') await markShowDone(entry.id, mediaItem)
    const [withMedia] = await withProgress([{ ...entry, mediaItem }])
    res.status(201).json(withMedia)
  }),
)

const updateEntrySchema = z.object({
  status: listStatusSchema.optional(),
  notes: z.string().nullable().optional(),
  // Set by the client when the entry is dragged: the midpoint of its new neighbours' positions.
  // (z.number() already rejects Infinity and NaN.)
  position: z.number().optional(),
  // Corrections to when it was started or finished (null for unknown). Sent alongside a status,
  // they're checked against that status; otherwise against the entry's current one.
  startedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  // TV shows only.
  tracking: z.enum(['show', 'season', 'episode']).optional(),
})

const toDate = (iso: string | null | undefined) => (iso == null ? iso : new Date(iso))

listsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = updateEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }

    // Starting or finishing needs the title to be out, and changing how a show is tracked needs
    // it to be a show, so the title is looked up alongside.
    const { status, tracking } = parsed.data
    const [existing, mediaItem] = await Promise.all([
      prisma.listEntry.findUnique({ where: { id: req.params.id } }),
      (status && status !== 'want') || tracking
        ? prisma.mediaItem.findFirst({ where: { listEntries: { some: { id: req.params.id } } } })
        : null,
    ])
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (tracking && !(mediaItem && isShow(mediaItem))) {
      res.status(400).json({ error: 'Only TV shows can be tracked by season or episode' })
      return
    }
    if (status && status !== 'want' && mediaItem && mediaItem.kind !== 'series' && !isOut(mediaItem)) {
      res.status(409).json({ error: "That isn't out yet" })
      return
    }
    // A finished show tracked by season or episode has every season that's out done, so its
    // progress agrees: when it's finished now, or when a finished show switches to such tracking.
    const nextTracking = tracking ?? existing.tracking
    const finishShow =
      mediaItem &&
      isShow(mediaItem) &&
      (nextTracking === 'season' || nextTracking === 'episode') &&
      (status === 'done' || (!status && existing.status === 'done' && tracking && tracking !== existing.tracking))

    // A status change moves the dates along, and any the user set themselves win over that.
    const nextStatus = status ?? existing.status
    const startedAt = toDate(parsed.data.startedAt)
    const completedAt = toDate(parsed.data.completedAt)
    const editingDates = startedAt !== undefined || completedAt !== undefined
    const moved = statusDates(existing, nextStatus)
    const dates = {
      startedAt: startedAt === undefined ? moved.startedAt : startedAt,
      completedAt: completedAt === undefined ? moved.completedAt : completedAt,
    }
    const problem = editingDates && invalidDates(nextStatus, dates)
    if (problem) {
      res.status(400).json({ error: problem })
      return
    }

    const [entry] = await Promise.all([
      prisma.listEntry.update({
        where: { id: req.params.id },
        data: {
          status,
          notes: parsed.data.notes,
          position: parsed.data.position,
          tracking,
          ...(status !== undefined || editingDates ? dates : {}),
        },
        include: { mediaItem: true },
      }),
      // Finishing a series finishes every volume that's out, as adding it finished does, or its
      // progress would disagree and the next volume change would move it back to in progress.
      status === 'done' && mediaItem?.kind === 'series' ? markSeriesDone(existing.id, mediaItem.id) : null,
      finishShow ? markShowDone(existing.id, mediaItem) : null,
    ])
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
      include: { volume: { select: { releasePending: true, releaseDate: true, releaseCheckedAt: true } } },
    }),
  ])
  return entry && entry.userId === userId && link ? { entry, link } : null
}

// After a series entry's volumes change, moves the entry itself along to match (see
// derivedSeriesStatus) and returns it with its progress, as the volume routes respond.
async function syncSeriesStatus(entry: ListEntry & { mediaItem: MediaItem }, seriesId: string) {
  const [total, byStatus] = await Promise.all([
    prisma.seriesVolume.count({ where: { seriesId, volume: isOutWhere() } }),
    prisma.volumeProgress.groupBy({ by: ['status'], where: { entryId: entry.id, volume: isOutWhere() }, _count: true }),
  ])
  const done = byStatus.find((row) => row.status === 'done')?._count ?? 0
  const started = byStatus.reduce((sum, row) => sum + row._count, 0)
  const nextStatus = derivedSeriesStatus(entry.status, { total, done, started })

  let updated = entry
  if (nextStatus !== entry.status) {
    const changed = await prisma.listEntry.update({
      where: { id: entry.id },
      data: { status: nextStatus, ...statusDates(entry, nextStatus) },
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
    const volumeId = z.uuid().safeParse(req.params.volumeId)
    if (!parsed.success || !volumeId.success) {
      res.status(400).json({ error: parsed.error ? z.flattenError(parsed.error) : z.flattenError(volumeId.error!) })
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
    if (status !== 'want' && !isOut(link.volume)) {
      res.status(409).json({ error: "That volume isn't out yet" })
      return
    }

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
listsRouter.post(
  '/:id/volumes/:volumeId/done-before',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const volumeId = z.uuid().safeParse(req.params.volumeId)
    if (!volumeId.success) {
      res.status(400).json({ error: z.flattenError(volumeId.error) })
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
      where: { seriesId: link.seriesId, position: { lt: link.position }, volume: isOutWhere() },
      select: { volumeId: true },
    })
    await markVolumesDone(
      entryId,
      earlier.map((volume) => volume.volumeId),
    )

    res.json(await syncSeriesStatus(entry, link.seriesId))
  }),
)

// Marks every volume of a series entry's series that's out done.
async function markSeriesDone(entryId: string, seriesId: string) {
  const volumes = await prisma.seriesVolume.findMany({
    where: { seriesId, volume: isOutWhere() },
    select: { volumeId: true },
  })
  await markVolumesDone(
    entryId,
    volumes.map((volume) => volume.volumeId),
  )
}

// Marks these volumes of a series entry done. Volumes already done keep their original completedAt.
async function markVolumesDone(entryId: string, volumeIds: string[]) {
  if (volumeIds.length === 0) return
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
}

const isShow = (item: Pick<MediaItem, 'type' | 'kind'>) => item.type === 'tv' && item.kind === 'title'

// A user's TV show entry, with its show, or null if it isn't theirs or isn't a show.
async function findShowEntry(userId: string, entryId: string) {
  const entry = await prisma.listEntry.findUnique({ where: { id: entryId }, include: { mediaItem: true } })
  return entry && entry.userId === userId && isShow(entry.mediaItem) ? entry : null
}

// A show entry's seasons in order, each with this user's progress through it and how many of its
// episodes have aired. Opening a show is when its seasons are brought up to date if they've gone
// stale (see refreshShow); a season found to be out by doing so is announced, after the response.
listsRouter.get(
  '/:id/seasons',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const entry = await findShowEntry(userId, req.params.id)
    if (!entry) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const { show, pushes } = await refreshShow(entry.mediaItem)
    if (pushes.length > 0) waitUntil(sendPush(pushes))
    // A finished show has every season that's out watched. Ones finished before seasons were
    // tracked have no rows yet, so they're filled in the first time it's opened.
    if (entry.status === 'done' && entry.tracking !== 'show') await markShowDone(entry.id, show)

    const [seasons, progress] = await Promise.all([
      prisma.tvSeason.findMany({ where: { showId: show.id }, orderBy: { number: 'asc' } }),
      prisma.seasonProgress.findMany({ where: { entryId: entry.id } }),
    ])
    const rowBySeason = new Map(progress.map((row) => [row.season, row]))
    res.json({
      tracking: entry.tracking,
      seasons: seasons.map((season) => {
        const row = rowBySeason.get(season.number)
        return {
          number: season.number,
          name: season.name,
          episodeCount: season.episodeCount,
          airDate: season.airDate,
          coverImageUrl: season.coverImageUrl,
          out: isSeasonOut(season, show),
          airedEpisodes: airedEpisodes(season, show),
          status: row?.status ?? 'want',
          episodes: row?.episodes ?? [],
        }
      }),
    })
  }),
)

// After a show entry's seasons change, moves the entry itself along to match (derivedSeriesStatus,
// with seasons as its units) and returns it with its progress, as the season routes respond.
async function syncShowStatus(entry: ListEntry & { mediaItem: MediaItem }) {
  const [seasons, rows] = await Promise.all([
    prisma.tvSeason.findMany({ where: { showId: entry.mediaItemId } }),
    prisma.seasonProgress.findMany({ where: { entryId: entry.id } }),
  ])
  const nextStatus = derivedSeriesStatus(entry.status, seasonCounts(seasons, entry.mediaItem, rows))

  let updated = entry
  if (nextStatus !== entry.status) {
    const changed = await prisma.listEntry.update({
      where: { id: entry.id },
      data: { status: nextStatus, ...statusDates(entry, nextStatus) },
    })
    updated = { ...changed, mediaItem: entry.mediaItem }
  }
  const progress = showProgress(updated.tracking, seasons, entry.mediaItem, rows)
  return progress ? { ...updated, progress } : updated
}

const seasonParamSchema = z.coerce.number().int().min(1).max(1000)
// A season's status as a whole (tracking by season), or the episodes of it watched (by episode).
const updateSeasonSchema = z.union([
  z.object({ status: listStatusSchema }),
  z.object({ episodes: z.array(z.number().int()).max(1000) }),
])

// Sets one season's status, or which of its episodes are watched, then moves the show's entry along.
listsRouter.put(
  '/:id/seasons/:season',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = updateSeasonSchema.safeParse(req.body)
    const number = seasonParamSchema.safeParse(req.params.season)
    if (!parsed.success || !number.success) {
      res.status(400).json({ error: parsed.error ? z.flattenError(parsed.error) : z.flattenError(number.error!) })
      return
    }

    const [entry, season] = await Promise.all([
      findShowEntry(userId, req.params.id),
      prisma.tvSeason.findFirst({
        where: { number: number.data, show: { listEntries: { some: { id: req.params.id, userId } } } },
      }),
    ])
    if (!entry || !season) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    let status
    let episodes: number[] = []
    if ('status' in parsed.data) {
      status = parsed.data.status
    } else {
      episodes = cleanEpisodes(parsed.data.episodes, season.episodeCount)
      // Unaired episodes can't have been watched.
      const aired = airedEpisodes(season, entry.mediaItem)
      episodes = episodes.filter((episode) => episode <= aired)
      status = seasonStatusFromEpisodes(episodes, season.episodeCount)
    }
    if (status !== 'want' && !isSeasonOut(season, entry.mediaItem)) {
      res.status(409).json({ error: "That season isn't out yet" })
      return
    }

    const key = { entryId_season: { entryId: entry.id, season: season.number } }
    const data = { status, episodes, completedAt: status === 'done' ? new Date() : null }
    if (status === 'want') {
      await prisma.seasonProgress.deleteMany({ where: { entryId: entry.id, season: season.number } })
    } else {
      try {
        await prisma.seasonProgress.create({ data: { entryId: entry.id, season: season.number, ...data } })
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error
        await prisma.seasonProgress.update({ where: key, data })
      }
    }

    res.json(await syncShowStatus(entry))
  }),
)

// Marks every season before this one done, for catching up on a show watched ahead of the app.
listsRouter.post(
  '/:id/seasons/:season/done-before',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const number = seasonParamSchema.safeParse(req.params.season)
    if (!number.success) {
      res.status(400).json({ error: z.flattenError(number.error) })
      return
    }
    const entry = await findShowEntry(userId, req.params.id)
    if (!entry) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const seasons = await prisma.tvSeason.findMany({ where: { showId: entry.mediaItemId, number: { lt: number.data } } })
    await markSeasonsDone(
      entry.id,
      seasons.filter((season) => isSeasonOut(season, entry.mediaItem)).map((season) => season.number),
    )
    res.json(await syncShowStatus(entry))
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
