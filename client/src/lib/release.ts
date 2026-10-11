import type { ListTab } from '../hooks/useStatusParam'
import type { ListEntry, MediaItem } from '../types'

// Whatever a title carries about its release: stored fields on a MediaItem, or `unreleased`
// straight from a provider (search results, details).
export type ReleaseInfo = Partial<Pick<MediaItem, 'releaseDate' | 'releasePending' | 'releaseCheckedAt'>> & {
  unreleased?: boolean
}

// How long after release a title is flagged as new.
const OUT_NOW_DAYS = 14

// Mirrors isOut on the server: stored titles are upcoming only once a check has seen them as
// such, and stop being upcoming the moment their date arrives.
export function isUpcoming(media: ReleaseInfo): boolean {
  if (media.unreleased !== undefined) return media.unreleased
  if (!media.releasePending || !media.releaseCheckedAt) return false
  return !(media.releaseDate && new Date(media.releaseDate).getTime() <= Date.now())
}

// "26 Oct", or "26 Oct 2027" when it isn't this year.
export function formatReleaseDate(date: string) {
  const day = new Date(date.length === 10 ? `${date}T00:00:00Z` : date)
  const sameYear = day.getUTCFullYear() === new Date().getUTCFullYear()
  return day.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  })
}

// A short tag for a title's card: when it's coming out, or that it just has.
export function releaseLabel(media: ReleaseInfo): { text: string; upcoming: boolean } | null {
  if (isUpcoming(media)) {
    return { text: media.releaseDate ? `Out ${formatReleaseDate(media.releaseDate)}` : 'Coming soon', upcoming: true }
  }
  if (media.releaseDate) {
    const age = Date.now() - new Date(media.releaseDate).getTime()
    if (age >= 0 && age < OUT_NOW_DAYS * 24 * 3600 * 1000) return { text: 'Out now', upcoming: false }
  }
  return null
}

// Which tab a list entry belongs on: a title that isn't out yet waits under Preorders whatever its
// status, so the backlog only holds things you can get to now. A series is never upcoming itself.
export function entryTab(entry: Pick<ListEntry, 'status' | 'mediaItem'>): ListTab {
  return entry.mediaItem.kind !== 'series' && isUpcoming(entry.mediaItem) ? 'upcoming' : entry.status
}

// Soonest first; titles without a date yet go last.
export function byReleaseDate(a: Pick<ListEntry, 'mediaItem'>, b: Pick<ListEntry, 'mediaItem'>) {
  const time = (entry: Pick<ListEntry, 'mediaItem'>) =>
    entry.mediaItem.releaseDate ? new Date(entry.mediaItem.releaseDate).getTime() : Number.MAX_SAFE_INTEGER
  return time(a) - time(b)
}
