import { api } from './api'
import type { MediaDetails, MediaKind, MediaSource, MediaType } from '../types'

// Details don't change within a session, so reopening a title (or opening it from another
// page) reuses the first request. Failed requests are dropped so the next open retries.
const cache = new Map<string, Promise<MediaDetails>>()

export function fetchMediaDetails(
  type: MediaType,
  externalId: string,
  kind: MediaKind = 'title',
  // A stored title's source; search results are from the type's current one, so leave it out.
  source?: MediaSource,
): Promise<MediaDetails> {
  const key = `${source ?? ''}:${type}:${kind}:${externalId}`
  let pending = cache.get(key)
  if (!pending) {
    const params = new URLSearchParams({ ...(kind === 'series' && { kind }), ...(source && { source }) }).toString()
    const query = params ? `?${params}` : ''
    pending = api.get<MediaDetails>(`/api/media/details/${type}/${encodeURIComponent(externalId)}${query}`)
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}
