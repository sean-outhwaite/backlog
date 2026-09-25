import { PROVIDER_TIMEOUT_MS, yearFromDate, type MediaProvider, type MediaSearchResult } from './types.js'

const OPEN_LIBRARY_BASE = 'https://openlibrary.org'
const COVER_BASE = 'https://covers.openlibrary.org/b/id'

interface OpenLibrarySearchDoc {
  key: string
  title: string
  cover_i?: number
  first_publish_year?: number
  readinglog_count?: number
}

interface OpenLibrarySearchResponse {
  docs: OpenLibrarySearchDoc[]
}

interface OpenLibraryWork {
  title: string
  description?: string | { value: string }
  covers?: number[]
  first_publish_date?: string
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
    url.searchParams.set('fields', 'key,title,cover_i,first_publish_year,readinglog_count')

    const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Open Library request failed: ${response.status}`)
    const data = (await response.json()) as OpenLibrarySearchResponse

    return data.docs.map((doc): MediaSearchResult => ({
      externalId: workKeyToExternalId(doc.key),
      type: 'book',
      title: doc.title,
      coverImageUrl: toCoverUrl(doc.cover_i),
      description: null,
      releaseYear: doc.first_publish_year ?? null,
      popularity: doc.readinglog_count ?? 0,
    }))
  },
  async getById(externalId) {
    const [response, firstPublishYear] = await Promise.all([
      fetch(`${OPEN_LIBRARY_BASE}/works/${externalId}.json`, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }),
      fetchFirstPublishYear(externalId),
    ])
    if (!response.ok) return null
    const work = (await response.json()) as OpenLibraryWork

    return {
      externalId,
      type: 'book',
      title: work.title,
      coverImageUrl: toCoverUrl(work.covers?.[0]),
      description: toDescription(work.description),
      releaseYear: firstPublishYear ?? yearFromDate(work.first_publish_date),
    }
  },
}

// The work record usually lacks a publish date; the search index derives one from all
// editions, so look the work up there by key. A year is nice-to-have, so failures yield null.
async function fetchFirstPublishYear(externalId: string): Promise<number | null> {
  const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
  url.searchParams.set('q', `key:/works/${externalId}`)
  url.searchParams.set('fields', 'first_publish_year')

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
    if (!response.ok) return null
    const data = (await response.json()) as { docs: Array<{ first_publish_year?: number }> }
    return data.docs[0]?.first_publish_year ?? null
  } catch {
    return null
  }
}
