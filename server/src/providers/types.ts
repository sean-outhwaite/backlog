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
