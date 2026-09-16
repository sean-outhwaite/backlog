import { Router } from 'express'
import type { MediaType } from '@prisma/client'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { allMediaTypes, providersByType, sourceByType } from '../providers/index.js'
import type { NormalizedMediaResult } from '../providers/types.js'

const RESULTS_PER_TYPE_WHEN_UNFILTERED = 8

const searchQuerySchema = z.object({
  q: z.string().min(1),
  type: z.enum(['movie', 'tv', 'book', 'game']).optional(),
})

async function upsertMediaItem(type: MediaType, result: NormalizedMediaResult) {
  return prisma.mediaItem.upsert({
    where: { source_externalId: { source: sourceByType[type], externalId: result.externalId } },
    create: {
      source: sourceByType[type],
      externalId: result.externalId,
      type,
      title: result.title,
      coverImageUrl: result.coverImageUrl,
      description: result.description,
    },
    update: {
      title: result.title,
      coverImageUrl: result.coverImageUrl,
      description: result.description ?? undefined,
    },
  })
}

export const mediaRouter = Router()

mediaRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    const { q, type } = parsed.data
    const typesToSearch = type ? [type] : allMediaTypes

    // Provider calls are plain HTTP and safe to run in parallel; the upserts below
    // are serialized so a broad, unfiltered search can't blow past the DB pooler's
    // concurrent-connection limit.
    const perTypeResults = await Promise.all(
      typesToSearch.map(async (mediaType) => {
        const results = await providersByType[mediaType].search(q)
        const capped = type ? results : results.slice(0, RESULTS_PER_TYPE_WHEN_UNFILTERED)
        return capped.map((result) => ({ mediaType, result }))
      }),
    )

    const mediaItems = []
    for (const { mediaType, result } of perTypeResults.flat()) {
      mediaItems.push(await upsertMediaItem(mediaType, result))
    }

    res.json(mediaItems)
  }),
)

mediaRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const mediaItem = await prisma.mediaItem.findUnique({ where: { id: req.params.id } })
    if (!mediaItem) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mediaItem)
  }),
)
