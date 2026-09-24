import type { MediaType } from '@prisma/client'

export interface NormalizedMediaResult {
  externalId: string
  type: MediaType
  title: string
  coverImageUrl: string | null
  description: string | null
}

// Search results also carry a rough popularity signal, used to rank results from different
// providers against each other. Each provider maps it from a "how many people engaged with
// this" count (TMDB vote_count, Open Library readinglog_count, RAWG added), which land on
// roughly the same scale: thousands for hits, single digits for obscure titles.
export interface MediaSearchResult extends NormalizedMediaResult {
  popularity: number
}

export interface MediaProvider {
  search(query: string): Promise<MediaSearchResult[]>
  getById(externalId: string): Promise<NormalizedMediaResult | null>
}

// Upper bound on any single provider HTTP call, so one hung API can't stall a search.
export const PROVIDER_TIMEOUT_MS = 5000
