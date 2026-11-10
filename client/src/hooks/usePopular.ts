import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { isRetiredSource } from '../lib/mediaTypes'
import type { ForYouResult, FriendsPopularItem, ListEntry, MediaItem, MediaSearchResult, MediaType } from '../types'

// What's popular right now, for filling pages that would otherwise be empty. null while
// loading (or while disabled); an empty array if nothing could be fetched. All types gets a few of
// each type mixed together, or with full every type's whole list mixed together.
export function usePopular(type: MediaType | 'all', enabled = true, full = false): MediaSearchResult[] | null {
  const [popular, setPopular] = useState<MediaSearchResult[] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const params = type === 'all' ? (full ? '?full=1' : '') : `?type=${type}`
    api
      .get<MediaSearchResult[]>(`/api/media/popular${params}`)
      .then((found) => {
        if (!cancelled) setPopular(found)
      })
      .catch(() => {
        if (!cancelled) setPopular([])
      })
    return () => {
      cancelled = true
    }
  }, [type, enabled, full])

  return enabled ? popular : null
}

// Titles on your friends' lists that aren't on yours, most shared first. Same null/empty contract
// as usePopular.
export function useFriendsPopular(type: MediaType | 'all', enabled = true): FriendsPopularItem[] | null {
  const [items, setItems] = useState<FriendsPopularItem[] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const params = type === 'all' ? '' : `?type=${type}`
    api
      .get<FriendsPopularItem[]>(`/api/media/popular/friends${params}`)
      .then((found) => {
        if (!cancelled) setItems(found)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [type, enabled])

  return enabled ? items : null
}

// Titles like the ones on your list. Same null/empty contract as usePopular. Fetched on its own,
// since the first visit after adding titles waits on the providers.
export function useForYou(): ForYouResult[] | null {
  const [items, setItems] = useState<ForYouResult[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<ForYouResult[]>('/api/media/for-you')
      .then((found) => {
        if (!cancelled) setItems(found)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return items
}

export function seriesKey(type: MediaType, seriesExternalId: string) {
  return `${type}:series:${seriesExternalId}`
}

// externalId alone isn't unique across types (a TMDB movie and show can share an id), or
// between a provider's series and titles. A stored title from a retired source (see isRetiredSource) gets
// its own prefix, so its id can't mark a different IGDB game as already added.
export function resultKey(
  result: Pick<MediaItem, 'type' | 'externalId'> & Partial<Pick<MediaItem, 'kind' | 'source'>>,
) {
  const key =
    result.kind === 'series' ? seriesKey(result.type, result.externalId) : `${result.type}:${result.externalId}`
  return isRetiredSource(result) ? `${result.source}:${key}` : key
}

// The status of everything on your list by resultKey, so results already there show it on arrival.
export function listedStatuses(entries: ListEntry[]) {
  return new Map(entries.map((entry) => [resultKey(entry.mediaItem), entry.status]))
}
