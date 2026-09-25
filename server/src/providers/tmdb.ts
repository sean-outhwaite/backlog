import { env } from '../lib/env.js'
import {
  joinNames,
  PROVIDER_TIMEOUT_MS,
  toFacts,
  yearFromDate,
  type MediaProvider,
  type MediaSearchResult,
} from './types.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

interface TmdbMovieResult {
  id: number
  title: string
  overview: string | null
  poster_path: string | null
  release_date?: string
  vote_count?: number
}

interface TmdbTvResult {
  id: number
  name: string
  overview: string | null
  poster_path: string | null
  first_air_date?: string
  vote_count?: number
}

interface TmdbNamed {
  name: string
}

interface TmdbCredits {
  cast: TmdbNamed[]
  crew: Array<TmdbNamed & { job: string }>
}

interface TmdbMovieDetail extends TmdbMovieResult {
  tagline: string | null
  runtime: number | null
  genres: TmdbNamed[]
  vote_average: number
  credits?: TmdbCredits
}

interface TmdbTvDetail extends TmdbTvResult {
  tagline: string | null
  genres: TmdbNamed[]
  created_by: TmdbNamed[]
  networks: TmdbNamed[]
  number_of_seasons: number | null
  number_of_episodes: number | null
  episode_run_time: number[]
  status: string | null
  vote_average: number
  // The whole run's cast; plain `credits` only lists the latest season's.
  aggregate_credits?: TmdbCredits
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

function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

function formatRating(voteAverage: number, voteCount: number | undefined): string | null {
  return voteCount ? `${voteAverage.toFixed(1)}/10 on TMDB` : null
}

function names(people: TmdbNamed[] | undefined): string[] {
  return (people ?? []).map((person) => person.name)
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export const tmdbMovieProvider: MediaProvider = {
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbMovieResult>>('/search/movie', { query })
    return (data?.results ?? []).map((r): MediaSearchResult => ({
      externalId: String(r.id),
      type: 'movie',
      title: r.title,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
      releaseYear: yearFromDate(r.release_date),
      popularity: r.vote_count ?? 0,
    }))
  },
  async getById(externalId) {
    const r = await tmdbFetch<TmdbMovieDetail>(`/movie/${externalId}`, { append_to_response: 'credits' })
    if (!r?.id) return null
    const directors = r.credits?.crew.filter((member) => member.job === 'Director')
    return {
      externalId: String(r.id),
      type: 'movie',
      title: r.title,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
      releaseYear: yearFromDate(r.release_date),
      tagline: r.tagline || null,
      genres: names(r.genres),
      facts: toFacts([
        ['Directed by', joinNames(names(directors))],
        ['Starring', joinNames(names(r.credits?.cast).slice(0, 4))],
        ['Runtime', formatRuntime(r.runtime)],
        ['Rating', formatRating(r.vote_average, r.vote_count)],
      ]),
      url: `https://www.themoviedb.org/movie/${r.id}`,
    }
  },
}

export const tmdbTvProvider: MediaProvider = {
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbTvResult>>('/search/tv', { query })
    return (data?.results ?? []).map((r): MediaSearchResult => ({
      externalId: String(r.id),
      type: 'tv',
      title: r.name,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
      releaseYear: yearFromDate(r.first_air_date),
      popularity: r.vote_count ?? 0,
    }))
  },
  async getById(externalId) {
    const r = await tmdbFetch<TmdbTvDetail>(`/tv/${externalId}`, { append_to_response: 'aggregate_credits' })
    if (!r?.id) return null
    const seasons =
      r.number_of_seasons &&
      [plural(r.number_of_seasons, 'season'), r.number_of_episodes && plural(r.number_of_episodes, 'episode')]
        .filter(Boolean)
        .join(' · ')
    return {
      externalId: String(r.id),
      type: 'tv',
      title: r.name,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
      releaseYear: yearFromDate(r.first_air_date),
      tagline: r.tagline || null,
      genres: names(r.genres),
      facts: toFacts([
        ['Created by', joinNames(names(r.created_by))],
        ['Network', joinNames(names(r.networks))],
        ['Starring', joinNames(names(r.aggregate_credits?.cast).slice(0, 4))],
        ['Seasons', seasons || null],
        ['Episode length', formatRuntime(r.episode_run_time[0])],
        ['Status', r.status],
        ['Rating', formatRating(r.vote_average, r.vote_count)],
      ]),
      url: `https://www.themoviedb.org/tv/${r.id}`,
    }
  },
}
