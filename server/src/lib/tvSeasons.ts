import type { MediaItem, TvSeason } from '@prisma/client'
import { isUniqueConstraintError, prisma } from './prisma.js'
import { providerFor } from '../providers/index.js'
import type { TvShowData, TvSeasonResult } from '../providers/types.js'
import { isSeasonOut } from './tvProgress.js'
import { seasonPush, type PushMessage } from './push.js'

// A show's seasons are trusted for most of a day: the daily release check refreshes every tracked
// show that hasn't been looked at since its last run, and opening a show's seasons does too.
export const SHOW_REFRESH_MS = 20 * 60 * 60 * 1000

const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null)

// Fetches a TV show's seasons from TMDB again once they're stale (or always, with force) and
// stores them. Seasons that have come out since are announced (see storeShow); the pushes for
// them are returned for the caller to send. If TMDB fails, the stored seasons are used as they are.
export async function refreshShow(
  show: MediaItem,
  { maxAgeMs = SHOW_REFRESH_MS }: { maxAgeMs?: number } = {},
): Promise<{ show: MediaItem; pushes: PushMessage[] }> {
  if (show.type !== 'tv' || show.kind !== 'title') return { show, pushes: [] }
  if (show.refreshedAt && Date.now() - show.refreshedAt.getTime() < maxAgeMs) return { show, pushes: [] }

  const provider = providerFor(show.source, show.type)
  if (!provider) return { show, pushes: [] }
  let details
  try {
    details = await provider.getById(show.externalId)
  } catch (error) {
    console.warn(`Refreshing seasons of ${show.id} failed:`, error)
    return { show, pushes: [] }
  }
  if (!details?.tv) {
    // Gone from TMDB: stop checking it for new seasons.
    const updated = await prisma.mediaItem.update({
      where: { id: show.id },
      data: { refreshedAt: new Date(), showEnded: true },
    })
    return { show: updated, pushes: [] }
  }
  return storeShow(show, details.tv)
}

// Stores a show's seasons and airing state as TMDB gives them now, and announces each season
// that has come out since it was last seen: one stored as upcoming that's now out, or a new one
// that's already out, if the show had been refreshed before (a show's first look, when it's added
// or when tracking began, stays quiet). A show's first season isn't announced: the show coming
// out is (see checkReleases). Concurrent refreshes announce a season once, since each claims it
// with a conditional update (or the insert) before announcing it.
export async function storeShow(show: MediaItem, data: TvShowData): Promise<{ show: MediaItem; pushes: PushMessage[] }> {
  const existing = await prisma.tvSeason.findMany({ where: { showId: show.id } })
  const byNumber = new Map(existing.map((season) => [season.number, season]))
  const airing = { lastAiredSeason: data.lastAired?.season ?? null, lastAiredEpisode: data.lastAired?.episode ?? null }
  const firstSeason = Math.min(...data.seasons.map((season) => season.number))
  const seenBefore = show.refreshedAt !== null

  const work = data.seasons.map(async (result): Promise<number | null> => {
    const fields = seasonFields(show.id, result)
    const out = isSeasonOut({ ...result, airDate: fields.airDate }, airing)
    const announceable = result.number !== firstSeason
    const stored = byNumber.get(result.number)

    if (!stored) {
      try {
        await prisma.tvSeason.create({ data: { ...fields, upcoming: !out } })
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error
        return null
      }
      return out && seenBefore && announceable ? result.number : null
    }

    if (stored.upcoming && out) {
      const { count } = await prisma.tvSeason.updateMany({
        where: { showId: show.id, number: result.number, upcoming: true },
        data: { ...fields, upcoming: false },
      })
      return count === 1 && announceable ? result.number : null
    }
    if (changed(stored, fields) || stored.upcoming !== !out) {
      await prisma.tvSeason.update({
        where: { showId_number: { showId: show.id, number: result.number } },
        data: { ...fields, upcoming: !out },
      })
    }
    return null
  })

  const [released, updated] = await Promise.all([
    Promise.all(work),
    prisma.mediaItem.update({
      where: { id: show.id },
      data: { ...airing, showEnded: data.ended, refreshedAt: new Date() },
    }),
  ])
  const pushes = await Promise.all(
    released.filter((number): number is number => number !== null).map((number) => announceSeason(updated, number)),
  )
  return { show: updated, pushes: pushes.filter((push) => push.userIds.length > 0) }
}

function seasonFields(showId: string, result: TvSeasonResult) {
  return {
    showId,
    number: result.number,
    name: result.name,
    episodeCount: result.episodeCount,
    airDate: toDate(result.airDate),
    coverImageUrl: result.coverImageUrl,
  }
}

function changed(stored: TvSeason, fields: ReturnType<typeof seasonFields>): boolean {
  return (
    stored.name !== fields.name ||
    stored.episodeCount !== fields.episodeCount ||
    stored.coverImageUrl !== fields.coverImageUrl ||
    stored.airDate?.getTime() !== fields.airDate?.getTime()
  )
}

// A new season is out: everyone with the show on their list hears about it, whatever they track
// it by, and those who'd finished it by season or episode have it moved back to in progress
// (finishing a whole-show entry stays finished: they only wanted to know).
async function announceSeason(show: MediaItem, season: number): Promise<PushMessage> {
  const entries = await prisma.listEntry.findMany({
    where: { mediaItemId: show.id },
    select: { id: true, userId: true, status: true, tracking: true },
  })
  const reopened = entries.filter(
    (entry) => entry.status === 'done' && (entry.tracking === 'season' || entry.tracking === 'episode'),
  )
  // The seasons they'd finished stay watched, even for shows finished before seasons were tracked.
  await Promise.all(reopened.map((entry) => markShowDone(entry.id, show, { except: season })))
  if (reopened.length > 0) {
    await prisma.listEntry.updateMany({
      where: { id: { in: reopened.map((entry) => entry.id) }, status: 'done' },
      data: { status: 'in_progress', completedAt: null },
    })
  }
  const userIds = [...new Set(entries.map((entry) => entry.userId))]
  if (userIds.length > 0) {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, type: 'new_season' as const, mediaItemId: show.id, season })),
    })
  }
  return { userIds, payload: seasonPush(show, season) }
}

// Marks every season of a show entry that's out done (but `except`, a season just announced).
export async function markShowDone(entryId: string, show: MediaItem, { except }: { except?: number } = {}) {
  const seasons = await prisma.tvSeason.findMany({ where: { showId: show.id } })
  await markSeasonsDone(
    entryId,
    seasons.filter((season) => season.number !== except && isSeasonOut(season, show)).map((season) => season.number),
  )
}

// Marks these seasons of a show entry done. Seasons already done keep their original completedAt.
export async function markSeasonsDone(entryId: string, numbers: number[]) {
  if (numbers.length === 0) return
  const completedAt = new Date()
  // Started seasons are updated, untouched ones (no row yet) created: disjoint rows, so in parallel.
  await Promise.all([
    prisma.seasonProgress.updateMany({
      where: { entryId, season: { in: numbers }, status: { not: 'done' } },
      data: { status: 'done', completedAt },
    }),
    prisma.seasonProgress.createMany({
      data: numbers.map((season) => ({ entryId, season, status: 'done' as const, completedAt })),
      skipDuplicates: true,
    }),
  ])
}
