import type { ListStatus, MediaSource, MediaType } from '@prisma/client'
import type { MediaSearchResult } from '../providers/types.js'

// The pure half of "For you" (lib/forYou.ts does the fetching and caching): which of your titles
// to find similar ones for, and how to rank what comes back.

// A title on your list, or a volume of a series on it, with when you last did something with it.
export interface HistoryRow {
  source: MediaSource
  type: MediaType
  externalId: string
  title: string
  status: ListStatus
  at: Date
}

export interface Seed {
  source: MediaSource
  type: MediaType
  externalId: string
  title: string
}

export interface ForYouResult extends MediaSearchResult {
  // The titles of yours it's like, most telling first.
  because: string[]
}

// Books have no provider recommendations (Open Library has no such thing).
export const SEED_TYPES: MediaType[] = ['movie', 'tv', 'game']
const SEEDS_PER_TYPE = 6
// Below this many started or finished titles of a type, wanted ones are used as well.
const MIN_ENGAGED = 3
const RESULTS_PER_TYPE = 8
const MAX_BECAUSE = 2
// Each suggestion counts 0.75-1 by its place in the list, so one more of your titles suggesting a
// title outweighs any real difference in popularity (the most-voted films, ~40k, add ~0.46),
// which mostly orders titles suggested by as many.
const POPULARITY_WEIGHT = 0.1

export const titleKey = (title: { type: MediaType; externalId: string }) => `${title.type}:${title.externalId}`

// Per type, your most recently started or finished titles. With only a few of those, your most
// recently added wanted ones fill in, since they still say what you're into. Titles whose source
// can't be fetched any more (isActive false) can't be looked up, so they're skipped.
export function pickSeeds(rows: HistoryRow[], isActive: (source: MediaSource, type: MediaType) => boolean): Seed[] {
  const byRecent = (a: HistoryRow, b: HistoryRow) => b.at.getTime() - a.at.getTime()
  return SEED_TYPES.flatMap((type) => {
    const ofType = rows.filter((row) => row.type === type && isActive(row.source, type))
    const engaged = ofType.filter((row) => row.status !== 'want').sort(byRecent)
    const wanted = engaged.length < MIN_ENGAGED ? ofType.filter((row) => row.status === 'want').sort(byRecent) : []
    // A title can be both on your list and a volume of a series on it.
    const seen = new Set<string>()
    return [...engaged, ...wanted]
      .filter((row) => !seen.has(row.externalId) && !!seen.add(row.externalId))
      .slice(0, SEEDS_PER_TYPE)
      .map(({ source, externalId, title }) => ({ source, type, externalId, title }))
  })
}

// Scores every suggestion by how many of your titles suggested it, each counting for more the
// higher up its list it is, plus a little for popularity. Leaves out what's already on your list
// (excluded, by titleKey) and titles with no cover or no date, which make poor cards and are
// mostly obscure or not yet announced. Each type gets a share, so TMDB's 20 suggestions per title
// can't crowd games out, and the types are mixed together, the one with the strongest pick first.
export function rankForYou(
  similar: Array<{ seed: Seed; results: MediaSearchResult[] }>,
  excluded: ReadonlySet<string>,
): ForYouResult[] {
  const scored = new Map<string, { result: MediaSearchResult; score: number; because: Map<string, number> }>()
  for (const { seed, results } of similar) {
    const usable = results.filter(
      (result) => result.coverImageUrl && result.releaseYear !== null && !excluded.has(titleKey(result)),
    )
    usable.forEach((result, i) => {
      const weight = 1 - i / (4 * usable.length)
      const key = titleKey(result)
      const entry = scored.get(key) ?? { result, score: 0, because: new Map<string, number>() }
      entry.score += weight
      entry.because.set(seed.title, Math.max(weight, entry.because.get(seed.title) ?? 0))
      scored.set(key, entry)
    })
  }

  const ranked = [...scored.values()]
    .map(({ result, score, because }) => ({
      result: {
        ...result,
        because: [...because]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_BECAUSE)
          .map(([title]) => title),
      },
      score: score + POPULARITY_WEIGHT * Math.log10(1 + result.popularity),
    }))
    .sort((a, b) => b.score - a.score)

  const lists = SEED_TYPES.map((type) => ranked.filter(({ result }) => result.type === type).slice(0, RESULTS_PER_TYPE))
    .filter((list) => list.length > 0)
    .sort((a, b) => b[0].score - a[0].score)
  const merged: ForYouResult[] = []
  for (let i = 0; i < RESULTS_PER_TYPE; i++) {
    for (const list of lists) if (i < list.length) merged.push(list[i].result)
  }
  return merged
}
