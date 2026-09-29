import { env } from '../lib/env.js'
import {
  joinNames,
  PROVIDER_TIMEOUT_MS,
  toFacts,
  yearFromDate,
  type MediaProvider,
  type MediaSearchResult,
} from './types.js'

const RAWG_BASE = 'https://api.rawg.io/api'

interface RawgGameSummary {
  id: number
  name: string
  background_image: string | null
  released: string | null
  added?: number
}

interface RawgSearchResponse {
  results: RawgGameSummary[]
}

interface RawgNamed {
  name: string
}

interface RawgGameDetail extends RawgGameSummary {
  slug: string
  description_raw: string | null
  platforms: Array<{ platform: RawgNamed }> | null
  developers: RawgNamed[]
  publishers: RawgNamed[]
  genres: RawgNamed[]
  metacritic: number | null
  playtime: number
  esrb_rating: RawgNamed | null
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

function toSearchResult(r: RawgGameSummary): MediaSearchResult {
  return {
    externalId: String(r.id),
    type: 'game',
    title: r.name,
    coverImageUrl: r.background_image,
    description: null,
    releaseYear: yearFromDate(r.released),
    popularity: r.added ?? 0,
  }
}

export const rawgProvider: MediaProvider = {
  async search(query) {
    const data = await rawgFetch<RawgSearchResponse>('/games', { search: query })
    return (data?.results ?? []).map(toSearchResult)
  },
  // RAWG has no trending feed; the most-added games released in the past year is the closest.
  async popular() {
    const today = new Date()
    const yearAgo = new Date(today)
    yearAgo.setFullYear(today.getFullYear() - 1)
    const dates = `${yearAgo.toISOString().slice(0, 10)},${today.toISOString().slice(0, 10)}`
    const data = await rawgFetch<RawgSearchResponse>('/games', { dates, ordering: '-added', page_size: '20' })
    return (data?.results ?? []).map(toSearchResult)
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
      releaseYear: yearFromDate(r.released),
      tagline: null,
      genres: r.genres.map((genre) => genre.name),
      facts: toFacts([
        [
          'Platforms',
          joinNames(
            r.platforms?.map((p) => p.platform.name),
            10,
          ),
        ],
        ['Developer', joinNames(r.developers.map((d) => d.name))],
        ['Publisher', joinNames(r.publishers.map((p) => p.name))],
        ['Metacritic', r.metacritic ? String(r.metacritic) : null],
        ['Average playtime', r.playtime ? `${r.playtime} hours` : null],
        ['Age rating', r.esrb_rating?.name],
      ]),
      url: `https://rawg.io/games/${r.slug}`,
    }
  },
}
