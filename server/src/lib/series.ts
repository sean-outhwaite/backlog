import type { ListEntry, ListStatus, MediaItem } from '@prisma/client'
import { prisma } from './prisma.js'

export interface SeriesProgress {
  done: number
  total: number
}

// How many volume covers a series card stacks up.
const STACKED_COVERS = 3

type EntryWithMedia = ListEntry & { mediaItem: MediaItem }

// Adds `progress` (volumes done / total) and `covers` (for the card's stack) to series entries.
// Two queries, run in parallel, and none at all when there are no series in the list.
export async function withProgress<T extends EntryWithMedia>(
  entries: T[],
): Promise<Array<T & { progress?: SeriesProgress; covers?: string[] }>> {
  const seriesEntries = entries.filter((entry) => entry.mediaItem.kind === 'series')
  if (seriesEntries.length === 0) return entries

  const [volumes, progressRows] = await Promise.all([
    prisma.seriesVolume.findMany({
      where: { seriesId: { in: seriesEntries.map((entry) => entry.mediaItemId) } },
      orderBy: { position: 'asc' },
      select: { seriesId: true, volumeId: true, volume: { select: { coverImageUrl: true } } },
    }),
    prisma.volumeProgress.findMany({
      where: { entryId: { in: seriesEntries.map((entry) => entry.id) }, status: 'done' },
      select: { entryId: true, volumeId: true },
    }),
  ])

  const volumesBySeries = new Map<string, typeof volumes>()
  for (const volume of volumes) {
    volumesBySeries.set(volume.seriesId, [...(volumesBySeries.get(volume.seriesId) ?? []), volume])
  }
  const doneByEntry = new Map<string, Set<string>>()
  for (const { entryId, volumeId } of progressRows) {
    doneByEntry.set(entryId, (doneByEntry.get(entryId) ?? new Set()).add(volumeId))
  }

  return entries.map((entry) => {
    if (entry.mediaItem.kind !== 'series') return entry
    const seriesVolumes = volumesBySeries.get(entry.mediaItemId) ?? []
    const done = doneByEntry.get(entry.id) ?? new Set<string>()
    return {
      ...entry,
      progress: { done: done.size, total: seriesVolumes.length },
      covers: stackCovers(seriesVolumes, done),
    }
  })
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
