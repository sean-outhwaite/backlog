import type { MediaType } from '@prisma/client'

export interface NormalizedMediaResult {
  externalId: string
  type: MediaType
  title: string
  coverImageUrl: string | null
  description: string | null
  releaseYear: number | null
}

// Search results also carry a rough popularity signal, used to rank results from different
// providers against each other. Each provider maps it from a "how many people engaged with
// this" count (TMDB vote_count, Open Library readinglog_count, RAWG added), which land on
// roughly the same scale: thousands for hits, single digits for obscure titles.
export interface MediaSearchResult extends NormalizedMediaResult {
  popularity: number
  // Set when the provider knows this title is part of a series (only Open Library does today).
  series?: SeriesRef
}

export interface SeriesRef {
  externalId: string
  title: string
}

export interface SeriesVolumeResult extends MediaSearchResult {
  position: number
}

// A series and its volumes in reading order, only ever from providers that implement getSeries.
export interface SeriesDetails {
  externalId: string
  title: string
  description: string | null
  url: string
  volumes: SeriesVolumeResult[]
}

// A labelled, display-ready detail ("Director": "Denis Villeneuve", "Platforms": "PC, PS5").
// Providers format these themselves so the client can render any type's details generically.
export interface MediaFact {
  label: string
  value: string
}

// Everything getById knows about a title. Only the NormalizedMediaResult fields are ever
// stored (on MediaItem); the rest is fetched live whenever someone opens a title's details.
export interface MediaDetails extends NormalizedMediaResult {
  tagline: string | null
  genres: string[]
  facts: MediaFact[]
  url: string
}

export interface MediaProvider {
  search(query: string): Promise<MediaSearchResult[]>
  // What's trending or popular right now, most popular first. Shown before the user searches.
  popular(): Promise<MediaSearchResult[]>
  getById(externalId: string): Promise<MediaDetails | null>
  getSeries?(externalId: string): Promise<SeriesDetails | null>
}

// Builds a facts list, dropping entries whose value is missing or empty.
export function toFacts(entries: Array<[label: string, value: string | null | undefined]>): MediaFact[] {
  return entries.filter((entry): entry is [string, string] => !!entry[1]).map(([label, value]) => ({ label, value }))
}

export function joinNames(names: string[] | undefined, max = 4): string | null {
  if (!names?.length) return null
  const shown = names.slice(0, max).join(', ')
  return names.length > max ? `${shown} +${names.length - max} more` : shown
}

// Providers give release dates in assorted shapes ("2024-03-01", "1969", "March 1969", "").
// The first four-digit run is the year in all of them.
export function yearFromDate(date: string | null | undefined): number | null {
  const match = date?.match(/\d{4}/)
  return match ? Number(match[0]) : null
}

// Upper bound on any single provider HTTP call, so one hung API can't stall a search.
export const PROVIDER_TIMEOUT_MS = 5000
