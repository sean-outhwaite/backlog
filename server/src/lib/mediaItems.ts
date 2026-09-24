import type { MediaItem } from '@prisma/client'
import { z } from 'zod'
import { prisma } from './prisma.js'
import { providersByType, sourceByType } from '../providers/index.js'

// A title can be referenced either by an existing MediaItem row, or (straight from search
// results, which aren't stored) by its provider identity.
export const mediaRefSchema = z.union([
  z.object({ mediaItemId: z.string().uuid() }),
  z.object({ type: z.enum(['movie', 'tv', 'book', 'game']), externalId: z.string().min(1) }),
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

  // upsert rather than create: two users adding the same new title at once shouldn't 500.
  return prisma.mediaItem.upsert({
    where,
    create: {
      source,
      type,
      externalId,
      title: details.title,
      coverImageUrl: details.coverImageUrl,
      description: details.description,
    },
    update: {},
  })
}
