import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { MediaSearchResult, MediaType } from '../types'

// What's popular right now, for filling pages that would otherwise be empty. null while
// loading (or while disabled); an empty array if nothing could be fetched.
export function usePopular(type: MediaType | 'all', enabled = true): MediaSearchResult[] | null {
  const [popular, setPopular] = useState<MediaSearchResult[] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const params = type === 'all' ? '' : `?type=${type}`
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
  }, [type, enabled])

  return enabled ? popular : null
}

export function seriesKey(type: MediaType, seriesExternalId: string) {
  return `${type}:series:${seriesExternalId}`
}

// externalId alone isn't unique across types (a TMDB movie and show can share an id), or
// between a provider's series and titles.
export function resultKey(result: MediaSearchResult) {
  return result.kind === 'series' ? seriesKey(result.type, result.externalId) : `${result.type}:${result.externalId}`
}
