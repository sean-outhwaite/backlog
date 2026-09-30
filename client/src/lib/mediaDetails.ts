import { api } from './api'
import type { MediaDetails, MediaKind, MediaType } from '../types'

// Details don't change within a session, so reopening a title (or opening it from another
// page) reuses the first request. Failed requests are dropped so the next open retries.
const cache = new Map<string, Promise<MediaDetails>>()

export function fetchMediaDetails(
  type: MediaType,
  externalId: string,
  kind: MediaKind = 'title',
): Promise<MediaDetails> {
  const key = `${type}:${kind}:${externalId}`
  let pending = cache.get(key)
  if (!pending) {
    const query = kind === 'series' ? '?kind=series' : ''
    pending = api.get<MediaDetails>(`/api/media/details/${type}/${encodeURIComponent(externalId)}${query}`)
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}
