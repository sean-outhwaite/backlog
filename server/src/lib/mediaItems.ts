import type { MediaItem, MediaType } from '@prisma/client'
import { z } from 'zod'
import { isUniqueConstraintError, prisma } from './prisma.js'
import { providersByType, sourceByType } from '../providers/index.js'
import type { SeriesDetails, SeriesVolumeResult } from '../providers/types.js'

// Provider ids (TMDB/RAWG numbers, Open Library "OL123W") are interpolated into provider URL
// paths, so only allow characters that can't change the path.
export const externalIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)

// A title can be referenced either by an existing MediaItem row, or (straight from search
// results, which aren't stored) by its provider identity.
export const mediaRefSchema = z.union([
  z.object({ mediaItemId: z.string().uuid() }),
  z.object({
    type: z.enum(['movie', 'tv', 'book', 'game']),
    externalId: externalIdSchema,
    kind: z.enum(['title', 'series']).default('title'),
  }),
])

export type MediaRef = z.infer<typeof mediaRefSchema>

// MediaItem rows are created lazily, the first time anyone adds or recommends a title.
// Details are always fetched from the provider rather than trusted from the client.
export async function resolveMediaItem(ref: MediaRef): Promise<MediaItem | null> {
  if ('mediaItemId' in ref) {
    return prisma.mediaItem.findUnique({ where: { id: ref.mediaItemId } })
  }

  const { type, externalId, kind } = ref
  if (kind === 'series') return resolveSeries(type, externalId)
  const source = sourceByType[type]
  const where = { source_type_kind_externalId: { source, type, kind, externalId } }

  const existing = await prisma.mediaItem.findUnique({ where })
  if (existing) return existing

  const details = await providersByType[type].getById(externalId)
  if (!details) return null

  try {
    return await prisma.mediaItem.create({
      data: {
        source,
        type,
        externalId,
        title: details.title,
        coverImageUrl: details.coverImageUrl,
        description: details.description,
        releaseYear: details.releaseYear,
      },
    })
  } catch (error) {
    // Someone else added the same new title between our lookup and insert.
    if (!isUniqueConstraintError(error)) throw error
    return prisma.mediaItem.findUnique({ where })
  }
}

// A series' MediaItem is created along with its volumes, the first time anyone adds it. The
// volumes are stored from the series listing rather than via getById (one request instead of
// one per volume), so some lack a description; the details view fetches that live anyway.
async function resolveSeries(type: MediaType, externalId: string): Promise<MediaItem | null> {
  const source = sourceByType[type]
  const where = { source_type_kind_externalId: { source, type, kind: 'series' as const, externalId } }

  const existing = await prisma.mediaItem.findUnique({ where })
  if (existing) return refreshSeries(existing)

  const getSeries = providersByType[type].getSeries
  const details = getSeries ? await getSeries(externalId) : null
  if (!details) return null

  let series: MediaItem
  try {
    series = await prisma.mediaItem.create({
      data: { source, type, kind: 'series', externalId, ...seriesFields(details), refreshedAt: new Date() },
    })
  } catch (error) {
    // Someone else added the same series between our lookup and insert; they link the volumes.
    if (!isUniqueConstraintError(error)) throw error
    return prisma.mediaItem.findUnique({ where })
  }

  await linkVolumes(series, details.volumes)
  return series
}

// How long a series' volume list is trusted before it's fetched again. New volumes come out
// months apart, so a day keeps it current without a provider call every time a series is opened.
const SERIES_REFRESH_MS = 24 * 60 * 60 * 1000

// Fetches a series from its provider again once it's stale, and links any new volumes. A new
// volume means nobody has finished the series any more, so every entry for it marked done, whoever
// it belongs to, moves back to in progress (what derivedSeriesStatus gives once done < total).
// Volumes the provider no longer lists stay linked, along with anyone's progress on them. If the
// provider fails, the stored series is used as it is and the refresh is tried again next time.
export async function refreshSeries(series: MediaItem): Promise<MediaItem> {
  if (series.kind !== 'series') return series
  if (series.refreshedAt && Date.now() - series.refreshedAt.getTime() < SERIES_REFRESH_MS) return series

  let details: SeriesDetails | null | undefined
  try {
    details = await providersByType[series.type].getSeries?.(series.externalId)
  } catch (error) {
    console.warn(`Refreshing series ${series.id} failed:`, error)
    return series
  }

  if (details) {
    const linked = await prisma.seriesVolume.findMany({
      where: { seriesId: series.id },
      select: { volumeId: true, position: true, volume: { select: { externalId: true } } },
    })
    const linkByExternalId = new Map(linked.map((link) => [link.volume.externalId, link]))
    const added = details.volumes.filter((volume) => !linkByExternalId.has(volume.externalId))
    const moved = details.volumes.flatMap((volume) => {
      const link = linkByExternalId.get(volume.externalId)
      return link && link.position !== volume.position ? [{ volumeId: link.volumeId, position: volume.position }] : []
    })

    if (added.length > 0) {
      await linkVolumes(series, added)
      await prisma.listEntry.updateMany({
        where: { mediaItemId: series.id, status: 'done' },
        data: { status: 'in_progress', completedAt: null },
      })
    }
    // Renumbering is rare (a provider fixing its data), so these are one update each.
    await Promise.all(
      moved.map(({ volumeId, position }) =>
        prisma.seriesVolume.update({ where: { seriesId_volumeId: { seriesId: series.id, volumeId } }, data: { position } }),
      ),
    )
  }

  // Marked refreshed even when the provider no longer has the series, so it isn't asked every time.
  return prisma.mediaItem.update({
    where: { id: series.id },
    data: { ...(details && seriesFields(details)), refreshedAt: new Date() },
  })
}

// The series' own stored fields. Volume one stands in for whatever the series itself lacks.
function seriesFields(details: SeriesDetails) {
  const [first] = details.volumes
  return {
    title: details.title,
    coverImageUrl: details.coverImageUrl ?? first.coverImageUrl,
    description: details.description,
    releaseYear: first.releaseYear,
  }
}

// Stores whichever of the volumes aren't MediaItems yet, then links them all to the series. Both
// are INSERT ... ON CONFLICT DO NOTHING (createMany with skipDuplicates), so volumes someone
// already added as standalone titles, or that are already linked, are left as they are.
async function linkVolumes(series: MediaItem, volumes: SeriesVolumeResult[]): Promise<void> {
  const { source, type } = series
  await prisma.mediaItem.createMany({
    data: volumes.map((volume) => ({
      source,
      type,
      externalId: volume.externalId,
      title: volume.title,
      coverImageUrl: volume.coverImageUrl,
      description: volume.description,
      releaseYear: volume.releaseYear,
    })),
    skipDuplicates: true,
  })
  const volumeItems = await prisma.mediaItem.findMany({
    where: { source, type, kind: 'title', externalId: { in: volumes.map((volume) => volume.externalId) } },
    select: { id: true, externalId: true },
  })
  const idByExternalId = new Map(volumeItems.map((item) => [item.externalId, item.id]))

  await prisma.seriesVolume.createMany({
    data: volumes.flatMap((volume) => {
      const volumeId = idByExternalId.get(volume.externalId)
      return volumeId ? [{ seriesId: series.id, volumeId, position: volume.position }] : []
    }),
    skipDuplicates: true,
  })
}
