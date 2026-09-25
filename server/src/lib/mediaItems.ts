import type { MediaItem } from '@prisma/client'
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
  z.object({ type: z.enum(['movie', 'tv', 'book', 'game']), externalId: externalIdSchema }),
])

export type MediaRef = z.infer<typeof mediaRefSchema>

// MediaItem rows are created lazily, the first time anyone adds or recommends a title.
// Details are always fetched from the provider rather than trusted from the client.
export async function resolveMediaItem(ref: MediaRef): Promise<MediaItem | null> {
  if ('mediaItemId' in ref) {
    return prisma.mediaItem.findUnique({ where: { id: ref.mediaItemId } })
  }

  const { type, externalId } = ref
  const source = sourceByType[type]
  const where = { source_type_externalId: { source, type, externalId } }

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
