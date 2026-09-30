import { env } from '../lib/env.js'
import {
  joinNames,
  PROVIDER_TIMEOUT_MS,
  toFacts,
  yearFromDate,
  type MediaProvider,
  toSeriesSearchResult,
  type MediaSearchResult,
  type SeriesDetails,
  type SeriesVolumeResult,
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
  belongs_to_collection: { id: number; name: string } | null
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

interface TmdbCollection {
  id: number
  name: string
  overview: string | null
  poster_path: string | null
}

interface TmdbCollectionDetail extends TmdbCollection {
  parts: TmdbMovieResult[]
}

// Collection search is noisy (fan-made and one-film collections), and its results carry no
// popularity or film count, so only the best few are expanded into full series.
const COLLECTIONS_TO_EXPAND = 3

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

function toMovieResult(r: TmdbMovieResult): MediaSearchResult {
  return {
    externalId: String(r.id),
    type: 'movie',
    title: r.title,
    coverImageUrl: toCoverUrl(r.poster_path),
    description: r.overview,
    releaseYear: yearFromDate(r.release_date),
    popularity: r.vote_count ?? 0,
  }
}

function toTvResult(r: TmdbTvResult): MediaSearchResult {
  return {
    externalId: String(r.id),
    type: 'tv',
    title: r.name,
    coverImageUrl: toCoverUrl(r.poster_path),
    description: r.overview,
    releaseYear: yearFromDate(r.first_air_date),
    popularity: r.vote_count ?? 0,
  }
}

// A collection's films in release order, numbered from 1. Only films that are out: undated or
// future entries (like "Untitled James Bond Film") can't be watched yet. A collection with
// fewer than two isn't a series worth tracking.
async function getCollection(externalId: string): Promise<SeriesDetails | null> {
  const collection = await tmdbFetch<TmdbCollectionDetail>(`/collection/${externalId}`, {})
  if (!collection?.id) return null
  const today = new Date().toISOString().slice(0, 10)
  const volumes = collection.parts
    .filter((part): part is TmdbMovieResult & { release_date: string } => !!part.release_date && part.release_date <= today)
    .sort((a, b) => a.release_date.localeCompare(b.release_date))
    .map((part, index): SeriesVolumeResult => ({ ...toMovieResult(part), position: index + 1 }))
  if (volumes.length < 2) return null
  return {
    externalId,
    title: collection.name,
    description: collection.overview || null,
    coverImageUrl: toCoverUrl(collection.poster_path),
    url: `https://www.themoviedb.org/collection/${collection.id}`,
    volumes,
  }
}

export const tmdbMovieProvider: MediaProvider = {
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbMovieResult>>('/search/movie', { query })
    return (data?.results ?? []).map(toMovieResult)
  },
  async popular() {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbMovieResult>>('/trending/movie/week', {})
    return (data?.results ?? []).map(toMovieResult)
  },
  getSeries: getCollection,
  async searchSeries(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbCollection>>('/search/collection', { query })
    const expanded = await Promise.allSettled(
      (data?.results ?? []).slice(0, COLLECTIONS_TO_EXPAND).map((collection) => getCollection(String(collection.id))),
    )
    return expanded.flatMap((outcome) =>
      outcome.status === 'fulfilled' && outcome.value ? [toSeriesSearchResult(outcome.value)] : [],
    )
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
      series: r.belongs_to_collection
        ? { externalId: String(r.belongs_to_collection.id), title: r.belongs_to_collection.name }
        : undefined,
    }
  },
}

export const tmdbTvProvider: MediaProvider = {
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbTvResult>>('/search/tv', { query })
    return (data?.results ?? []).map(toTvResult)
  },
  async popular() {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbTvResult>>('/trending/tv/week', {})
    return (data?.results ?? []).map(toTvResult)
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
