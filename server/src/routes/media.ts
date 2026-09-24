import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { allMediaTypes, providersByType } from '../providers/index.js'
import type { NormalizedMediaResult } from '../providers/types.js'

const RESULTS_PER_TYPE_WHEN_UNFILTERED = 8

const searchQuerySchema = z.object({
  q: z.string().min(1),
  type: z.enum(['movie', 'tv', 'book', 'game']).optional(),
})

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

    // Search results are returned straight from the providers and never stored; a
    // MediaItem row is only created when a title is added or recommended (see
    // resolveMediaItem), so search does no DB work at all. allSettled so one slow or failing provider (RAWG occasionally hangs then 502s)
    // doesn't take the whole search down with it.
    const settled = await Promise.allSettled(
      typesToSearch.map(async (mediaType) => {
        const results = await providersByType[mediaType].search(q)
        return type ? results : results.slice(0, RESULTS_PER_TYPE_WHEN_UNFILTERED)
      }),
    )

    const results: NormalizedMediaResult[] = []
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') results.push(...outcome.value)
      else console.warn(`Search provider for "${typesToSearch[i]}" failed:`, outcome.reason)
    })

    if (settled.every((outcome) => outcome.status === 'rejected')) {
      res.status(502).json({ error: 'All search providers failed' })
      return
    }

    res.json(results)
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
