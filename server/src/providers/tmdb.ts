import { env } from '../lib/env.js'
import { PROVIDER_TIMEOUT_MS, type MediaProvider, type MediaSearchResult } from './types.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

interface TmdbMovieResult {
  id: number
  title: string
  overview: string | null
  poster_path: string | null
  vote_count?: number
}

interface TmdbTvResult {
  id: number
  name: string
  overview: string | null
  poster_path: string | null
  vote_count?: number
}

interface TmdbSearchResponse<T> {
  results: T[]
}

// Resolves to null on a 404 so getById can report a missing title instead of throwing.
async function tmdbFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${TMDB_BASE}${path}`)
  url.searchParams.set('api_key', env.tmdbApiKey)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`)
  return (await response.json()) as T
}

function toCoverUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null
}

export const tmdbMovieProvider: MediaProvider = {
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbMovieResult>>('/search/movie', { query })
    return (data?.results ?? []).map(
      (r): MediaSearchResult => ({
        externalId: String(r.id),
        type: 'movie',
        title: r.title,
        coverImageUrl: toCoverUrl(r.poster_path),
        description: r.overview,
        popularity: r.vote_count ?? 0,
      }),
    )
  },
  async getById(externalId) {
    const r = await tmdbFetch<TmdbMovieResult>(`/movie/${externalId}`, {})
    if (!r?.id) return null
    return {
      externalId: String(r.id),
      type: 'movie',
      title: r.title,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
    }
  },
}

export const tmdbTvProvider: MediaProvider = {
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbTvResult>>('/search/tv', { query })
    return (data?.results ?? []).map(
      (r): MediaSearchResult => ({
        externalId: String(r.id),
        type: 'tv',
        title: r.name,
        coverImageUrl: toCoverUrl(r.poster_path),
        description: r.overview,
        popularity: r.vote_count ?? 0,
      }),
    )
  },
  async getById(externalId) {
    const r = await tmdbFetch<TmdbTvResult>(`/tv/${externalId}`, {})
    if (!r?.id) return null
    return {
      externalId: String(r.id),
      type: 'tv',
      title: r.name,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
    }
  },
}
