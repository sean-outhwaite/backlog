import { env } from '../lib/env.js'
import type { MediaProvider, NormalizedMediaResult } from './types.js'

const RAWG_BASE = 'https://api.rawg.io/api'

interface RawgGameSummary {
  id: number
  name: string
  background_image: string | null
}

interface RawgSearchResponse {
  results: RawgGameSummary[]
}

interface RawgGameDetail extends RawgGameSummary {
  description_raw: string | null
}

async function rawgFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${RAWG_BASE}${path}`)
  url.searchParams.set('key', env.rawgApiKey)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`RAWG request failed: ${response.status}`)
  return (await response.json()) as T
}

export const rawgProvider: MediaProvider = {
  async search(query) {
    const data = await rawgFetch<RawgSearchResponse>('/games', { search: query })
    return data.results.map(
      (r): NormalizedMediaResult => ({
        externalId: String(r.id),
        type: 'game',
        title: r.name,
        coverImageUrl: r.background_image,
        description: null,
      }),
    )
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
