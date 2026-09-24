import { PROVIDER_TIMEOUT_MS, type MediaProvider, type MediaSearchResult } from './types.js'

const OPEN_LIBRARY_BASE = 'https://openlibrary.org'
const COVER_BASE = 'https://covers.openlibrary.org/b/id'

interface OpenLibrarySearchDoc {
  key: string
  title: string
  cover_i?: number
  readinglog_count?: number
}

interface OpenLibrarySearchResponse {
  docs: OpenLibrarySearchDoc[]
}

interface OpenLibraryWork {
  title: string
  description?: string | { value: string }
  covers?: number[]
}

function workKeyToExternalId(key: string): string {
  return key.replace('/works/', '')
}

function toCoverUrl(coverId: number | undefined): string | null {
  return coverId ? `${COVER_BASE}/${coverId}-M.jpg` : null
}

function toDescription(description: OpenLibraryWork['description']): string | null {
  if (!description) return null
  return typeof description === 'string' ? description : description.value
}

export const openLibraryProvider: MediaProvider = {
  async search(query) {
    const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '20')
    url.searchParams.set('fields', 'key,title,cover_i,readinglog_count')

    const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Open Library request failed: ${response.status}`)
    const data = (await response.json()) as OpenLibrarySearchResponse

    return data.docs.map(
      (doc): MediaSearchResult => ({
        externalId: workKeyToExternalId(doc.key),
        type: 'book',
        title: doc.title,
        coverImageUrl: toCoverUrl(doc.cover_i),
        description: null,
        popularity: doc.readinglog_count ?? 0,
      }),
    )
  },
  async getById(externalId) {
    const response = await fetch(`${OPEN_LIBRARY_BASE}/works/${externalId}.json`, {
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const work = (await response.json()) as OpenLibraryWork

    return {
      externalId,
      type: 'book',
      title: work.title,
      coverImageUrl: toCoverUrl(work.covers?.[0]),
      description: toDescription(work.description),
    }
  },
}
