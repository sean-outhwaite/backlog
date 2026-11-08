import type { ListEntry, ListStatus } from '@prisma/client'
import type { MediaSearchResult } from '../providers/types.js'
import { normalize } from './searchRanking.js'

// Pure decisions for moving games stored from RAWG onto IGDB (src/scripts/remapRawgGames.ts does
// the I/O). IGDB doesn't know RAWG ids, so a game is matched by its title and year.

export type MatchStatus = 'matched' | 'ambiguous' | 'not_found'

export interface GameMatch {
  status: MatchStatus
  // Set only for a confident match: the same title, once normalised, and the same release year,
  // from one candidate, or one that clearly dominates the others (see DOMINANT_RATIO). Anything
  // less is left for a person to pick.
  igdbId: string | null
  // The likeliest candidate when it isn't confident, to save looking it up by hand.
  suggestedId: string | null
}

// IGDB often lists a game's same-year ports alongside it under the same name. The original has
// hundreds or thousands of ratings and the ports a handful, so one with at least this many times
// the next one's popularity is taken as the game.
const DOMINANT_RATIO = 10

// RAWG put the year in some titles ("Prince of Persia (1989)"); IGDB doesn't, and searching with
// it finds nothing.
export function searchTitle(title: string): string {
  return title.replace(/\s*\(\d{4}\)$/, '')
}

export function matchGame(
  row: { title: string; releaseYear: number | null },
  candidates: Pick<MediaSearchResult, 'externalId' | 'title' | 'releaseYear' | 'popularity'>[],
): GameMatch {
  if (candidates.length === 0) return { status: 'not_found', igdbId: null, suggestedId: null }
  const title = normalize(searchTitle(row.title))
  const byPopularity = [...candidates].sort((a, b) => b.popularity - a.popularity)
  const sameTitle = byPopularity.filter((candidate) => normalize(candidate.title) === title)
  const sameYear = sameTitle.filter(
    (candidate) => row.releaseYear !== null && candidate.releaseYear === row.releaseYear,
  )
  const [top, next] = sameYear
  if (top && (!next || top.popularity >= DOMINANT_RATIO * Math.max(next.popularity, 1))) {
    return { status: 'matched', igdbId: top.externalId, suggestedId: null }
  }
  const suggested = top ?? sameTitle[0] ?? byPopularity[0]
  return { status: 'ambiguous', igdbId: null, suggestedId: suggested.externalId }
}

const STATUS_RANK: Record<ListStatus, number> = { want: 0, in_progress: 1, done: 2 }

// When someone has a game on their list twice (once as the RAWG row, once as the IGDB one), the
// entry that's further along wins, then the one added first. The other's notes fill in if the
// winner has none.
export function mergeEntries<T extends Pick<ListEntry, 'status' | 'addedAt' | 'notes'>>(
  a: T,
  b: T,
): { keep: T; drop: T; notes: string | null } {
  const aFirst =
    STATUS_RANK[a.status] !== STATUS_RANK[b.status]
      ? STATUS_RANK[a.status] > STATUS_RANK[b.status]
      : a.addedAt.getTime() <= b.addedAt.getTime()
  const [keep, drop] = aFirst ? [a, b] : [b, a]
  return { keep, drop, notes: keep.notes ?? drop.notes }
}
