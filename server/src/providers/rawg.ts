import { env } from '../lib/env.js'
import { PROVIDER_TIMEOUT_MS, type MediaProvider, type MediaSearchResult } from './types.js'

const RAWG_BASE = 'https://api.rawg.io/api'

interface RawgGameSummary {
  id: number
  name: string
  background_image: string | null
  added?: number
}

interface RawgSearchResponse {
  results: RawgGameSummary[]
}

interface RawgGameDetail extends RawgGameSummary {
  description_raw: string | null
}

// Resolves to null on a 404 so getById can report a missing title instead of throwing.
async function rawgFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${RAWG_BASE}${path}`)
  url.searchParams.set('key', env.rawgApiKey)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`RAWG request failed: ${response.status}`)
  return (await response.json()) as T
}

export const rawgProvider: MediaProvider = {
  async search(query) {
    const data = await rawgFetch<RawgSearchResponse>('/games', { search: query })
    return (data?.results ?? []).map((r): MediaSearchResult => ({
      externalId: String(r.id),
      type: 'game',
      title: r.name,
      coverImageUrl: r.background_image,
      description: null,
      popularity: r.added ?? 0,
    }))
  },
  async getById(externalId) {
    const r = await rawgFetch<RawgGameDetail>(`/games/${externalId}`, {})
    if (!r?.id) return null
    return {
      externalId: String(r.id),
      type: 'game',
      title: r.name,
      coverImageUrl: r.background_image,
      description: r.description_raw,
    }
  },
}
