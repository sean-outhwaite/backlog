import type { ListEntry, ListStatus, MediaItem } from '@prisma/client'
import { prisma } from './prisma.js'
import { isOut } from './releases.js'
import { showProgress, type ShowProgress } from './tvProgress.js'

export interface SeriesProgress {
  done: number
  total: number
}

// How many volume covers a series card stacks up.
const STACKED_COVERS = 3

type EntryWithMedia = ListEntry & { mediaItem: MediaItem }

// Whether an entry is a TV show tracked by season or episode, so has progress of its own.
export const tracksSeasons = (entry: EntryWithMedia) =>
  entry.mediaItem.type === 'tv' &&
  entry.mediaItem.kind === 'title' &&
  (entry.tracking === 'season' || entry.tracking === 'episode')

// Adds `progress` to series entries (volumes done / total, and `covers` for the card's stack) and
// to TV shows tracked by season or episode (see showProgress). Only volumes and seasons that are
// out count: an announced one isn't something you can have finished yet. Up to four queries, run
// in parallel, and none at all when there are no such entries in the list.
export async function withProgress<T extends EntryWithMedia>(
  entries: T[],
): Promise<Array<T & { progress?: SeriesProgress | ShowProgress; covers?: string[] }>> {
  const seriesEntries = entries.filter((entry) => entry.mediaItem.kind === 'series')
  const showEntries = entries.filter(tracksSeasons)
  if (seriesEntries.length === 0 && showEntries.length === 0) return entries

  const [volumes, progressRows, seasons, seasonRows] = await Promise.all([
    seriesEntries.length === 0
      ? []
      : prisma.seriesVolume.findMany({
          where: { seriesId: { in: seriesEntries.map((entry) => entry.mediaItemId) } },
          orderBy: { position: 'asc' },
          select: {
            seriesId: true,
            volumeId: true,
            volume: { select: { coverImageUrl: true, releasePending: true, releaseDate: true, releaseCheckedAt: true } },
          },
        }),
    seriesEntries.length === 0
      ? []
      : prisma.volumeProgress.findMany({
          where: { entryId: { in: seriesEntries.map((entry) => entry.id) }, status: 'done' },
          select: { entryId: true, volumeId: true },
        }),
    showEntries.length === 0
      ? []
      : prisma.tvSeason.findMany({
          where: { showId: { in: showEntries.map((entry) => entry.mediaItemId) } },
          select: { showId: true, number: true, episodeCount: true, airDate: true },
        }),
    showEntries.length === 0
      ? []
      : prisma.seasonProgress.findMany({
          where: { entryId: { in: showEntries.map((entry) => entry.id) } },
          select: { entryId: true, season: true, status: true, episodes: true },
        }),
  ])

  const volumesBySeries = new Map<string, typeof volumes>()
  for (const volume of volumes) {
    if (!isOut(volume.volume)) continue
    volumesBySeries.set(volume.seriesId, [...(volumesBySeries.get(volume.seriesId) ?? []), volume])
  }
  const doneByEntry = new Map<string, Set<string>>()
  for (const { entryId, volumeId } of progressRows) {
    doneByEntry.set(entryId, (doneByEntry.get(entryId) ?? new Set()).add(volumeId))
  }
  const seasonsByShow = groupBy(seasons, (season) => season.showId)
  const seasonRowsByEntry = groupBy(seasonRows, (row) => row.entryId)

  return entries.map((entry) => {
    if (tracksSeasons(entry)) {
      const showSeasons = seasonsByShow.get(entry.mediaItemId) ?? []
      // A finished show has watched every season that's out, whether or not it has rows for them
      // yet (shows finished before seasons were tracked get theirs when opened).
      const rows =
        entry.status === 'done'
          ? showSeasons.map((season) => ({ season: season.number, status: 'done' as const, episodes: [] }))
          : (seasonRowsByEntry.get(entry.id) ?? [])
      const progress = showProgress(entry.tracking, showSeasons, entry.mediaItem, rows)
      return progress ? { ...entry, progress } : entry
    }
    if (entry.mediaItem.kind !== 'series') return entry
    const seriesVolumes = volumesBySeries.get(entry.mediaItemId) ?? []
    const doneAny = doneByEntry.get(entry.id) ?? new Set<string>()
    const done = new Set(seriesVolumes.map((volume) => volume.volumeId).filter((id) => doneAny.has(id)))
    return {
      ...entry,
      progress: { done: done.size, total: seriesVolumes.length },
      covers: stackCovers(seriesVolumes, done),
    }
  })
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

// The card's stack starts where the reader is up to: the first unread volume in front, the
// ones after it behind. A finished series shows its last volume.
function stackCovers(
  volumes: Array<{ volumeId: string; volume: { coverImageUrl: string | null } }>,
  done: Set<string>,
): string[] {
  const nextUp = volumes.findIndex((volume) => !done.has(volume.volumeId))
  const start = nextUp === -1 ? volumes.length - 1 : nextUp
  return volumes
    .slice(start)
    .map((volume) => volume.volume.coverImageUrl)
    .filter((url): url is string => url !== null)
    .slice(0, STACKED_COVERS)
}

// The status a series entry should move to after one of its volumes changes: done once every
// volume is, in progress once any volume is started, otherwise whatever it already was.
export function derivedSeriesStatus(
  current: ListStatus,
  counts: { total: number; done: number; started: number },
): ListStatus {
  if (counts.total > 0 && counts.done === counts.total) return 'done'
  if (current === 'done') return 'in_progress'
  if (current === 'want' && counts.started > 0) return 'in_progress'
  return current
}
