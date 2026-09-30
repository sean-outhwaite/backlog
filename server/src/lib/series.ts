import type { ListEntry, ListStatus, MediaItem } from '@prisma/client'
import { prisma } from './prisma.js'

export interface SeriesProgress {
  done: number
  total: number
}

type EntryWithMedia = ListEntry & { mediaItem: MediaItem }

// Adds `progress` (volumes done / total) to series entries. Two grouped queries, run in
// parallel, and none at all when there are no series in the list.
export async function withProgress<T extends EntryWithMedia>(
  entries: T[],
): Promise<Array<T & { progress?: SeriesProgress }>> {
  const seriesEntries = entries.filter((entry) => entry.mediaItem.kind === 'series')
  if (seriesEntries.length === 0) return entries

  const [totals, dones] = await Promise.all([
    prisma.seriesVolume.groupBy({
      by: ['seriesId'],
      where: { seriesId: { in: seriesEntries.map((entry) => entry.mediaItemId) } },
      _count: true,
    }),
    prisma.volumeProgress.groupBy({
      by: ['entryId'],
      where: { entryId: { in: seriesEntries.map((entry) => entry.id) }, status: 'done' },
      _count: true,
    }),
  ])
  const totalBySeries = new Map(totals.map((row) => [row.seriesId, row._count]))
  const doneByEntry = new Map(dones.map((row) => [row.entryId, row._count]))

  return entries.map((entry) =>
    entry.mediaItem.kind === 'series'
      ? { ...entry, progress: { done: doneByEntry.get(entry.id) ?? 0, total: totalBySeries.get(entry.mediaItemId) ?? 0 } }
      : entry,
  )
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
