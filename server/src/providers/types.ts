import type { MediaType } from '@prisma/client'

export interface NormalizedMediaResult {
  externalId: string
  type: MediaType
  title: string
  coverImageUrl: string | null
  description: string | null
}

export interface MediaProvider {
  search(query: string): Promise<NormalizedMediaResult[]>
  getById(externalId: string): Promise<NormalizedMediaResult | null>
}

// Upper bound on any single provider HTTP call, so one hung API can't stall a search.
export const PROVIDER_TIMEOUT_MS = 5000
