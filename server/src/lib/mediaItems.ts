import type { MediaItem, MediaType } from '@prisma/client'
import { z } from 'zod'
import { isUniqueConstraintError, prisma } from './prisma.js'
import { providersByType, sourceByType } from '../providers/index.js'

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
// one per volume), so they have no description; the details view fetches that live anyway.
async function resolveSeries(type: MediaType, externalId: string): Promise<MediaItem | null> {
  const source = sourceByType[type]
  const where = { source_type_kind_externalId: { source, type, kind: 'series' as const, externalId } }

  const existing = await prisma.mediaItem.findUnique({ where })
  if (existing) return existing

  const getSeries = providersByType[type].getSeries
  const details = getSeries ? await getSeries(externalId) : null
  if (!details) return null

  // createMany with skipDuplicates is a single INSERT ... ON CONFLICT DO NOTHING, so volumes
  // someone already added as standalone titles are left as they are and looked up below.
  await prisma.mediaItem.createMany({
    data: details.volumes.map((volume) => ({
      source,
      type,
      externalId: volume.externalId,
      title: volume.title,
      coverImageUrl: volume.coverImageUrl,
      releaseYear: volume.releaseYear,
    })),
    skipDuplicates: true,
  })
  const volumeItems = await prisma.mediaItem.findMany({
    where: { source, type, kind: 'title', externalId: { in: details.volumes.map((volume) => volume.externalId) } },
    select: { id: true, externalId: true },
  })
  const idByExternalId = new Map(volumeItems.map((item) => [item.externalId, item.id]))

  const [first] = details.volumes
  let series: MediaItem
  try {
    series = await prisma.mediaItem.create({
      data: {
        source,
        type,
        kind: 'series',
        externalId,
        title: details.title,
        coverImageUrl: first.coverImageUrl,
        description: details.description,
        releaseYear: first.releaseYear,
      },
    })
  } catch (error) {
    // Someone else added the same series between our lookup and insert; they link the volumes.
    if (!isUniqueConstraintError(error)) throw error
    return prisma.mediaItem.findUnique({ where })
  }

  await prisma.seriesVolume.createMany({
    data: details.volumes.flatMap((volume) => {
      const volumeId = idByExternalId.get(volume.externalId)
      return volumeId ? [{ seriesId: series.id, volumeId, position: volume.position }] : []
    }),
    skipDuplicates: true,
  })
  return series
}
