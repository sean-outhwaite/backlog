import { waitUntil } from '@vercel/functions'
import { Prisma, type MediaType } from '@prisma/client'
import { providerFor, providersByType } from '../providers/index.js'
import type { MediaSearchResult } from '../providers/types.js'
import { pickSeeds, rankForYou, titleKey, type ForYouResult, type HistoryRow, type Seed } from './forYouRanking.js'
import { prisma } from './prisma.js'

// "For you" on Recommendations: titles like the ones on your list, from the providers' own
// recommendations (TMDB) and similar games (IGDB). What a provider suggests for a title isn't
// about you, so it's cached per title in SimilarTitles and shared by everyone with that title;
// only the ranking and the "already on your list" filter are per user, done on every request.

const FRESH_MS = 24 * 60 * 60 * 1000
// How long a request waits for titles fetched for the first time. Anything slower is still saved
// (after the response, via waitUntil) and shows on the next visit.
const FIRST_FETCH_WAIT_MS = 2500

const seedKey = (seed: Pick<Seed, 'source' | 'type' | 'externalId'>) => `${seed.source}:${titleKey(seed)}`

// Fetches in progress on this instance, so two requests for the same titles share one lookup.
// null means the lookup failed.
const inFlight = new Map<string, Promise<MediaSearchResult[] | null>>()

export async function forYou(userId: string): Promise<ForYouResult[]> {
  // Everything on your list, plus the volumes of series on it (which have no entry of their own),
  // so a film in a collection you're tracking isn't suggested to you.
  const rows = await prisma.$queryRaw<HistoryRow[]>`
    SELECT m."source", m."type", m."externalId", m."title", e."status",
      COALESCE(e."completedAt", e."startedAt", e."addedAt") AS "at"
    FROM "ListEntry" e
    JOIN "MediaItem" m ON m."id" = e."mediaItemId"
    WHERE e."userId" = ${userId} AND m."kind" = 'title'
    UNION ALL
    SELECT v."source", v."type", v."externalId", v."title", COALESCE(p."status", 'want'),
      COALESCE(p."completedAt", e."startedAt", e."addedAt")
    FROM "ListEntry" e
    JOIN "SeriesVolume" sv ON sv."seriesId" = e."mediaItemId"
    JOIN "MediaItem" v ON v."id" = sv."volumeId"
    LEFT JOIN "VolumeProgress" p ON p."entryId" = e."id" AND p."volumeId" = v."id"
    WHERE e."userId" = ${userId}
  `
  const isActive = (source: HistoryRow['source'], type: MediaType) => providerFor(source, type) !== null
  const seeds = pickSeeds(rows, isActive)
  if (seeds.length === 0) return []
  // Suggestions come from each type's current provider, so only rows from it can match them.
  const excluded = new Set(rows.filter((row) => isActive(row.source, row.type)).map(titleKey))

  const cached = await prisma.similarTitles.findMany({
    where: { OR: seeds.map(({ source, type, externalId }) => ({ source, type, externalId })) },
  })
  const cachedByKey = new Map(cached.map((row) => [seedKey(row), row]))
  const missing = seeds.filter((seed) => !cachedByKey.has(seedKey(seed)))
  const stale = seeds.filter((seed) => {
    const row = cachedByKey.get(seedKey(seed))
    return row && Date.now() - row.fetchedAt.getTime() > FRESH_MS
  })

  // Stale titles are shown from the cache and refreshed after the response; missing ones are
  // waited for, up to a point. A failed refresh keeps the old row.
  const fetches = fetchSimilar([...missing, ...stale])
  waitUntil(Promise.allSettled(fetches.values()))
  const fetchedByKey = new Map(
    await withDeadline(FIRST_FETCH_WAIT_MS, (deadline) =>
      Promise.all(
        missing.map(
          async (seed) => [seedKey(seed), await Promise.race([fetches.get(seedKey(seed))!, deadline])] as const,
        ),
      ),
    ),
  )

  const similar = seeds.flatMap((seed) => {
    const results = cachedByKey.has(seedKey(seed))
      ? (cachedByKey.get(seedKey(seed))!.results as unknown as MediaSearchResult[])
      : fetchedByKey.get(seedKey(seed))
    return results ? [{ seed, results }] : []
  })
  return rankForYou(similar, excluded)
}

// Looks up similar titles for each seed, one provider call per type, and saves what it finds.
// Returns each seed's lookup by seedKey.
function fetchSimilar(seeds: Seed[]): Map<string, Promise<MediaSearchResult[] | null>> {
  const lookups = new Map<string, Promise<MediaSearchResult[] | null>>()
  const byType = new Map<MediaType, Seed[]>()
  for (const seed of seeds) {
    const pending = inFlight.get(seedKey(seed))
    if (pending) lookups.set(seedKey(seed), pending)
    else byType.set(seed.type, [...(byType.get(seed.type) ?? []), seed])
  }

  for (const [type, ofType] of byType) {
    const similar = providersByType[type].similar
    const batch = (async () => {
      if (!similar) return new Map<string, MediaSearchResult[]>()
      const found = await similar(ofType.map((seed) => seed.externalId))
      await saveSimilar(
        ofType.flatMap((seed) => (found.has(seed.externalId) ? [{ seed, results: found.get(seed.externalId)! }] : [])),
      )
      return found
    })().catch((error) => {
      console.warn(`Similar titles for ${type} failed:`, error)
      return new Map<string, MediaSearchResult[]>()
    })
    for (const seed of ofType) {
      const key = seedKey(seed)
      const lookup = batch.then((found) => found.get(seed.externalId) ?? null)
      inFlight.set(key, lookup)
      void lookup.finally(() => inFlight.delete(key))
      lookups.set(key, lookup)
    }
  }
  return lookups
}

// One INSERT ... ON CONFLICT for the lot, rather than Prisma's upsert (a transaction per row).
async function saveSimilar(rows: Array<{ seed: Seed; results: MediaSearchResult[] }>) {
  if (rows.length === 0) return
  const now = new Date()
  await prisma.$executeRaw`
    INSERT INTO "SimilarTitles" ("source", "type", "externalId", "results", "fetchedAt")
    VALUES ${Prisma.join(
      rows.map(
        ({ seed, results }) =>
          Prisma.sql`(${seed.source}::"MediaSource", ${seed.type}::"MediaType", ${seed.externalId}, ${JSON.stringify(results)}::jsonb, ${now})`,
      ),
    )}
    ON CONFLICT ("source", "type", "externalId")
    DO UPDATE SET "results" = EXCLUDED."results", "fetchedAt" = EXCLUDED."fetchedAt"
  `
}

// Runs run with a promise that resolves to null after ms, to race lookups against, and clears
// the timer once run is done.
async function withDeadline<T>(ms: number, run: (deadline: Promise<null>) => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await run(deadline)
  } finally {
    clearTimeout(timer)
  }
}
