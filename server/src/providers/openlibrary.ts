import {
  joinNames,
  PROVIDER_TIMEOUT_MS,
  toFacts,
  yearFromDate,
  type MediaProvider,
  type MediaSearchResult,
  type SeriesDetails,
  type SeriesVolumeResult,
} from './types.js'

const OPEN_LIBRARY_BASE = 'https://openlibrary.org'
const COVER_BASE = 'https://covers.openlibrary.org/b/id'

interface OpenLibrarySearchDoc {
  key: string
  title: string
  cover_i?: number
  first_publish_year?: number
  readinglog_count?: number
  // Parallel arrays, one element per series the work belongs to.
  series_key?: string[]
  series_name?: string[]
  series_position?: string[]
}

const SEARCH_FIELDS = 'key,title,cover_i,first_publish_year,readinglog_count,series_key,series_name,series_position'

// Series volumes are few (Berserk has 43), so one page covers all but the longest runs.
const MAX_SERIES_VOLUMES = 200

interface OpenLibrarySeries {
  name: string
  description?: string | { value: string } | null
}

interface OpenLibrarySearchResponse {
  docs: OpenLibrarySearchDoc[]
}

interface OpenLibraryTrendingResponse {
  works: OpenLibrarySearchDoc[]
}

interface OpenLibraryWork {
  title: string
  description?: string | { value: string }
  covers?: number[]
  first_publish_date?: string
  subjects?: string[]
}

// Per-work fields the search index aggregates across all editions.
interface OpenLibraryIndexEntry {
  author_name?: string[]
  series_key?: string[]
  series_name?: string[]
  first_publish_year?: number
  number_of_pages_median?: number
}

function workKeyToExternalId(key: string): string {
  return key.replace('/works/', '')
}

function toCoverUrl(coverId: number | undefined): string | null {
  return coverId ? `${COVER_BASE}/${coverId}-M.jpg` : null
}

// Descriptions are user-edited Markdown, often with link references and a trailing
// "----------" section of source links. Reduce them to plain paragraphs.
function toDescription(description: OpenLibraryWork['description']): string | null {
  if (!description) return null
  const text = (typeof description === 'string' ? description : description.value)
    .replace(/\r\n/g, '\n')
    .split(/\n-{3,}\n/)[0]
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/\[([^\]]+)\](\([^)]*\)|\[[^\]]*\])/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

// Subjects mix genres with machine tags ("award:hugo_award=1970") and near-duplicates.
function toGenres(subjects: string[] | undefined): string[] {
  const seen = new Set<string>()
  const genres: string[] = []
  for (const subject of subjects ?? []) {
    const key = subject.toLowerCase()
    if (/[:=]/.test(subject) || subject.length > 30 || seen.has(key)) continue
    seen.add(key)
    genres.push(subject)
    if (genres.length === 6) break
  }
  return genres
}

function toSearchResult(doc: OpenLibrarySearchDoc): MediaSearchResult {
  return {
    externalId: workKeyToExternalId(doc.key),
    type: 'book',
    title: doc.title,
    coverImageUrl: toCoverUrl(doc.cover_i),
    description: null,
    releaseYear: doc.first_publish_year ?? null,
    popularity: doc.readinglog_count ?? 0,
    series:
      doc.series_key?.[0] && doc.series_name?.[0]
        ? { externalId: doc.series_key[0], title: doc.series_name[0] }
        : undefined,
  }
}

// A work's position in the given series. Box sets and omnibuses have ranges ("1-7") rather
// than a number; they aren't single volumes, so they're left out.
function seriesPosition(doc: OpenLibrarySearchDoc, seriesKey: string): number | null {
  const index = doc.series_key?.indexOf(seriesKey) ?? -1
  const position = index >= 0 ? doc.series_position?.[index] : undefined
  return position && /^\d+(\.\d+)?$/.test(position.trim()) ? Number(position) : null
}

export const openLibraryProvider: MediaProvider = {
  async search(query) {
    const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '20')
    url.searchParams.set('fields', SEARCH_FIELDS)

    const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Open Library request failed: ${response.status}`)
    const data = (await response.json()) as OpenLibrarySearchResponse

    return data.docs.map(toSearchResult)
  },
  async popular() {
    const response = await fetch(`${OPEN_LIBRARY_BASE}/trending/weekly.json?limit=20`, {
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Open Library request failed: ${response.status}`)
    const data = (await response.json()) as OpenLibraryTrendingResponse
    return data.works.map(toSearchResult)
  },
  async getSeries(externalId) {
    const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
    url.searchParams.set('q', `series_key:${externalId}`)
    url.searchParams.set('limit', String(MAX_SERIES_VOLUMES))
    url.searchParams.set('fields', SEARCH_FIELDS)

    const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    const [seriesResponse, searchResponse] = await Promise.all([
      fetch(`${OPEN_LIBRARY_BASE}/series/${externalId}.json`, { signal }),
      fetch(url, { signal }),
    ])
    if (!seriesResponse.ok) return null
    if (!searchResponse.ok) throw new Error(`Open Library request failed: ${searchResponse.status}`)
    const series = (await seriesResponse.json()) as OpenLibrarySeries
    const data = (await searchResponse.json()) as OpenLibrarySearchResponse

    const volumes = data.docs
      .map((doc): SeriesVolumeResult | null => {
        const position = seriesPosition(doc, externalId)
        return position === null ? null : { ...toSearchResult(doc), position }
      })
      .filter((volume): volume is SeriesVolumeResult => volume !== null)
      .sort((a, b) => a.position - b.position)
    if (volumes.length === 0) return null

    return {
      externalId,
      title: series.name,
      description: toDescription(series.description ?? undefined),
      coverImageUrl: null,
      url: `${OPEN_LIBRARY_BASE}/series/${externalId}`,
      volumes,
    } satisfies SeriesDetails
  },
  async getById(externalId) {
    const [response, indexEntry] = await Promise.all([
      fetch(`${OPEN_LIBRARY_BASE}/works/${externalId}.json`, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }),
      fetchIndexEntry(externalId),
    ])
    if (!response.ok) return null
    const work = (await response.json()) as OpenLibraryWork

    return {
      externalId,
      type: 'book',
      title: work.title,
      coverImageUrl: toCoverUrl(work.covers?.[0]),
      description: toDescription(work.description),
      releaseYear: indexEntry?.first_publish_year ?? yearFromDate(work.first_publish_date),
      tagline: null,
      genres: toGenres(work.subjects),
      facts: toFacts([
        ['By', joinNames(indexEntry?.author_name)],
        ['Pages', indexEntry?.number_of_pages_median ? `About ${indexEntry.number_of_pages_median}` : null],
      ]),
      url: `${OPEN_LIBRARY_BASE}/works/${externalId}`,
      series:
        indexEntry?.series_key?.[0] && indexEntry.series_name?.[0]
          ? { externalId: indexEntry.series_key[0], title: indexEntry.series_name[0] }
          : undefined,
    }
  },
}

// The work record usually lacks a publish date and only links authors by key; the search
// index has both (plus page counts) aggregated from all editions, so look the work up there.
// These are nice-to-haves, so failures yield null rather than failing the whole lookup.
async function fetchIndexEntry(externalId: string): Promise<OpenLibraryIndexEntry | null> {
  const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
  url.searchParams.set('q', `key:/works/${externalId}`)
  url.searchParams.set('fields', 'author_name,first_publish_year,number_of_pages_median,series_key,series_name')

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
    if (!response.ok) return null
    const data = (await response.json()) as { docs: OpenLibraryIndexEntry[] }
    return data.docs[0] ?? null
  } catch {
    return null
  }
}
