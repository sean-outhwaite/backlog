import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { allMediaTypes, providersByType } from '../providers/index.js'
import type { MediaSearchResult } from '../providers/types.js'
import { externalIdSchema } from '../lib/mediaItems.js'
import { rankSearchResults } from '../lib/searchRanking.js'

const RESULTS_PER_TYPE_WHEN_UNFILTERED = 8

const searchQuerySchema = z.object({
  q: z.string().min(1),
  type: z.enum(['movie', 'tv', 'book', 'game']).optional(),
})

const detailsParamsSchema = z.object({
  type: z.enum(['movie', 'tv', 'book', 'game']),
  externalId: externalIdSchema,
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

    const results: MediaSearchResult[] = []
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') results.push(...outcome.value)
      else console.warn(`Search provider for "${typesToSearch[i]}" failed:`, outcome.reason)
    })

    if (settled.every((outcome) => outcome.status === 'rejected')) {
      res.status(502).json({ error: 'All search providers failed' })
      return
    }

    res.json(rankSearchResults(results, q))
  }),
)

// Full details for one title, fetched live from its provider for the details view. Like
// search, this never touches the DB: only the core fields are ever stored on MediaItem.
mediaRouter.get(
  '/details/:type/:externalId',
  asyncHandler(async (req, res) => {
    const parsed = detailsParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    const { type, externalId } = parsed.data

    const details = await providersByType[type].getById(externalId)
    if (!details) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.set('Cache-Control', 'private, max-age=3600')
    res.json(details)
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
