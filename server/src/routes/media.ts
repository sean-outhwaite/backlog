import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { allMediaTypes, providersByType } from '../providers/index.js'
import type { MediaType } from '@prisma/client'
import { toFacts, type MediaDetails, type MediaSearchResult } from '../providers/types.js'
import { externalIdSchema } from '../lib/mediaItems.js'
import { rankSearchResults } from '../lib/searchRanking.js'

const RESULTS_PER_TYPE_WHEN_UNFILTERED = 8
const SERIES_PER_TYPE_WHEN_UNFILTERED = 2
const POPULAR_PER_TYPE_WHEN_UNFILTERED = 6
const POPULAR_CACHE_MS = 60 * 60 * 1000

const searchQuerySchema = z.object({
  q: z.string().min(1),
  type: z.enum(['movie', 'tv', 'book', 'game']).optional(),
})

const popularQuerySchema = z.object({
  type: z.enum(['movie', 'tv', 'book', 'game']).optional(),
})

// Popular lists are the same for everyone and change slowly, so cache each provider's for
// an hour rather than hitting four external APIs every time someone opens Search.
const popularCache = new Map<MediaType, { results: MediaSearchResult[]; expiresAt: number }>()

async function popularFor(type: MediaType): Promise<MediaSearchResult[]> {
  const cached = popularCache.get(type)
  if (cached && cached.expiresAt > Date.now()) return cached.results
  const results = await providersByType[type].popular()
  popularCache.set(type, { results, expiresAt: Date.now() + POPULAR_CACHE_MS })
  return results
}

// Interleaves lists (a1, b1, c1, a2, b2, ...) so an unfiltered view mixes every type.
function interleave<T>(lists: T[][]): T[] {
  const merged: T[] = []
  const longest = Math.max(0, ...lists.map((list) => list.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) merged.push(list[i])
  }
  return merged
}

const detailsParamsSchema = z.object({
  type: z.enum(['movie', 'tv', 'book', 'game']),
  externalId: externalIdSchema,
})

const detailsQuerySchema = z.object({
  kind: z.enum(['title', 'series']).default('title'),
})

const SERIES_PART_LABELS: Record<MediaType, string> = { book: 'Volumes', movie: 'Films', tv: 'Seasons', game: 'Games' }

// A series' details, shaped like a title's so the details view can show either.
async function seriesDetails(type: MediaType, externalId: string): Promise<MediaDetails | null> {
  const getSeries = providersByType[type].getSeries
  const series = getSeries ? await getSeries(externalId) : null
  if (!series) return null
  const [first] = series.volumes
  const years = series.volumes.map((volume) => volume.releaseYear).filter((year): year is number => year !== null)
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : null
  return {
    externalId,
    type,
    title: series.title,
    coverImageUrl: series.coverImageUrl ?? first.coverImageUrl,
    description: series.description,
    releaseYear: first.releaseYear,
    tagline: null,
    genres: [],
    facts: toFacts([
      [SERIES_PART_LABELS[type], String(series.volumes.length)],
      [type === 'book' ? 'Published' : 'Released', span],
    ]),
    url: series.url,
  }
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

    // Search results are returned straight from the providers and never stored; a
    // MediaItem row is only created when a title is added or recommended (see
    // resolveMediaItem), so search does no DB work at all. allSettled so one slow or failing provider (RAWG occasionally hangs then 502s)
    // doesn't take the whole search down with it.
    // Each type's titles, plus whole series for providers that search those separately.
    const searches = typesToSearch.flatMap((mediaType) => {
      const provider = providersByType[mediaType]
      const titles = {
        label: mediaType,
        run: () => provider.search(q),
        limit: RESULTS_PER_TYPE_WHEN_UNFILTERED,
      }
      const searchSeries = provider.searchSeries
      if (!searchSeries) return [titles]
      return [titles, { label: `${mediaType} series`, run: () => searchSeries(q), limit: SERIES_PER_TYPE_WHEN_UNFILTERED }]
    })
    const settled = await Promise.allSettled(
      searches.map(async ({ run, limit }) => {
        const results = await run()
        return type ? results : results.slice(0, limit)
      }),
    )

    const results: MediaSearchResult[] = []
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') results.push(...outcome.value)
      else console.warn(`Search provider for "${searches[i].label}" failed:`, outcome.reason)
    })

    if (settled.every((outcome) => outcome.status === 'rejected')) {
      res.status(502).json({ error: 'All search providers failed' })
      return
    }

    res.json(rankSearchResults(results, q))
  }),
)

mediaRouter.get(
  '/popular',
  asyncHandler(async (req, res) => {
    const parsed = popularQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }
    const { type } = parsed.data
    const types = type ? [type] : allMediaTypes

    const settled = await Promise.allSettled(types.map(popularFor))
    const lists: MediaSearchResult[][] = []
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        lists.push(type ? outcome.value : outcome.value.slice(0, POPULAR_PER_TYPE_WHEN_UNFILTERED))
      } else {
        console.warn(`Popular provider for "${types[i]}" failed:`, outcome.reason)
      }
    })

    if (lists.length === 0) {
      res.status(502).json({ error: 'All providers failed' })
      return
    }

    res.json(interleave(lists))
  }),
)

// Full details for one title, fetched live from its provider for the details view. Like
// search, this never touches the DB: only the core fields are ever stored on MediaItem.
mediaRouter.get(
  '/details/:type/:externalId',
  asyncHandler(async (req, res) => {
    const parsed = detailsParamsSchema.safeParse(req.params)
    const query = detailsQuerySchema.safeParse(req.query)
    if (!parsed.success || !query.success) {
      res.status(400).json({ error: (parsed.error ?? query.error)?.flatten() })
      return
    }
    const { type, externalId } = parsed.data

    const details =
      query.data.kind === 'series'
        ? await seriesDetails(type, externalId)
        : await providersByType[type].getById(externalId)
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
