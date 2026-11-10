import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ListEntry, ListStatus, MediaItem, MediaSearchResult } from '../types'
import { listedStatuses, resultKey, seriesKey } from './usePopular'

// What's on your list and with what status, by resultKey (series by seriesKey), plus the adds that
// keep it current, for pages that show search or popular results with Add buttons.
export function useListed() {
  const [listed, setListed] = useState<Map<string, ListStatus>>(new Map())

  useEffect(() => {
    api
      .get<ListEntry[]>('/api/lists')
      .then((entries) => setListed((prev) => new Map([...listedStatuses(entries), ...prev])))
      .catch(() => {})
  }, [])

  async function addResult(result: MediaSearchResult, status: ListStatus) {
    await api.post('/api/lists', {
      type: result.type,
      externalId: result.externalId,
      kind: result.kind,
      status,
    })
    setListed((prev) => new Map(prev).set(resultKey(result), status))
  }

  async function addMediaItem(mediaItem: MediaItem, status: ListStatus) {
    await api.post('/api/lists', { mediaItemId: mediaItem.id, status })
    setListed((prev) => new Map(prev).set(resultKey(mediaItem), status))
  }

  // Keyed by series rather than result, so every volume's card shows the series as added.
  async function addSeries(result: MediaSearchResult, status: ListStatus) {
    const series = result.series
    if (!series) return
    await api.post('/api/lists', { type: result.type, externalId: series.externalId, kind: 'series', status })
    setListed((prev) => new Map(prev).set(seriesKey(result.type, series.externalId), status))
  }

  return { listed, addResult, addMediaItem, addSeries }
}
