import { env } from '../lib/env.js'
import { bestsellersEnabled, fetchBestsellers, type Bestseller } from './nyt.js'
import {
  joinNames,
  parseReleaseDate,
  PROVIDER_TIMEOUT_MS,
  providerFetch,
  todayIso,
  toFacts,
  yearFromDate,
  type MediaProvider,
  type MediaSearchResult,
  type SeriesDetails,
  type SeriesVolumeResult,
} from './types.js'

const OPEN_LIBRARY_BASE = 'https://openlibrary.org'
const COVER_BASE = 'https://covers.openlibrary.org/b/id'

// Open Library allows 1 request/second from anonymous clients and 3 from ones that identify
// themselves with an app name and contact in the User-Agent.
const USER_AGENT = env.openLibraryContact ? `Backlog (${env.openLibraryContact})` : 'Backlog'

function openLibraryFetch(
  url: string | URL,
  { signal, allowNotFound }: { signal?: AbortSignal; allowNotFound?: boolean } = {},
) {
  return providerFetch('Open Library', url, { signal, allowNotFound, headers: { 'User-Agent': USER_AGENT } })
}

// Works are titled in their original language ("Ostatnie Życzenie"), so with lang=en the search
// index also returns the edition that best fits an English reader, to take its title from.
// Editions are matched against the query too, so a Polish search still gets a Polish edition.
interface OpenLibraryEditions {
  editions?: { docs: { key: string; title: string; language?: string[] }[] }
}

interface OpenLibrarySearchDoc extends OpenLibraryEditions {
  key: string
  title: string
  // Only requested when matching bestsellers.
  author_name?: string[]
  isbn?: string[]
  cover_i?: number
  first_publish_year?: number
  readinglog_count?: number
  // Every edition's publish date, in whatever shape it was entered.
  publish_date?: string[]
  // Parallel arrays, one element per series the work belongs to.
  series_key?: string[]
  series_name?: string[]
  series_position?: string[]
}

// The edition fields only come back when `key` and `editions` are requested as well.
const EDITION_FIELDS = 'editions,editions.key,editions.title,editions.language'

const SEARCH_FIELDS = `key,title,cover_i,first_publish_year,publish_date,readinglog_count,series_key,series_name,series_position,${EDITION_FIELDS}`

// Without the edition fields: bestsellers are English already, and with ~50 works the English
// edition lookup (lang=en) takes Open Library about 10s instead of 1.
const BESTSELLER_FIELDS =
  'key,title,cover_i,first_publish_year,publish_date,readinglog_count,series_key,series_name,series_position,author_name,isbn'
const POPULAR_LIMIT = 20

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
  description?: OpenLibraryDescription
  covers?: number[]
  first_publish_date?: string
  subjects?: string[]
}

type OpenLibraryDescription = string | { value: string }

interface OpenLibraryEdition {
  description?: OpenLibraryDescription
}

// Per-work fields the search index aggregates across all editions.
interface OpenLibraryIndexEntry extends OpenLibraryEditions {
  author_name?: string[]
  series_key?: string[]
  series_name?: string[]
  first_publish_year?: number
  publish_date?: string[]
  number_of_pages_median?: number
}

function workKeyToExternalId(key: string): string {
  return key.replace('/works/', '')
}

function toCoverUrl(coverId: number | undefined): string | null {
  return coverId ? `${COVER_BASE}/${coverId}-M.jpg` : null
}

// Descriptions are user-edited Markdown, often with link references, emphasis and a trailing
// "----------" section of source links. Reduce them to plain paragraphs.
function toDescription(description: OpenLibraryDescription | undefined): string | null {
  if (!description) return null
  const text = (typeof description === 'string' ? description : description.value)
    .replace(/\r\n/g, '\n')
    .split(/\n-{3,}\n/)[0]
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/\[([^\]]+)\](\([^)]*\)|\[[^\]]*\])/g, '$1')
    .replace(/^>\s?/gm, '')
    // Headings and emphasis ("***He can resist any woman***", "_Dune_"), and rule lines ("* * *").
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*([*_-])(\s*\1){2,}\s*$/gm, '')
    .replace(/(\*{1,3}|_{1,3})(?=\S)([\s\S]*?\S)\1(?![\p{L}\p{N}])/gu, '$2')
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

// A work is out once its first edition is. Upcoming only when that first edition has an exact date
// still to come: a bare future year ("2027") is too vague to count down to.
function releaseFields(publishDates: string[] | undefined, firstPublishYear: number | null) {
  const earliest = (publishDates ?? [])
    .map(parseReleaseDate)
    .filter((parsed) => parsed !== null)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const releaseDate = earliest?.exact ? earliest.date : null
  return {
    releaseYear: firstPublishYear ?? (earliest ? Number(earliest.date.slice(0, 4)) : null),
    releaseDate,
    unreleased: !!releaseDate && releaseDate > todayIso(),
  }
}

// Letters and digits only, for comparing titles and names that differ in case or punctuation.
const letters = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// The English edition, when its title is a translation of the work's rather than the same
// title with different casing or punctuation ("Rich dad poor dad"), which the work spells better.
function englishEdition(entry: OpenLibraryEditions | null, workTitle: string) {
  const edition = entry?.editions?.docs[0]
  if (!edition?.language?.includes('eng') || letters(edition.title) === letters(workTitle)) return null
  return edition
}

function toSearchResult(doc: OpenLibrarySearchDoc): MediaSearchResult {
  return {
    externalId: workKeyToExternalId(doc.key),
    type: 'book',
    title: englishEdition(doc, doc.title)?.title ?? doc.title,
    coverImageUrl: toCoverUrl(doc.cover_i),
    description: null,
    ...releaseFields(doc.publish_date, doc.first_publish_year ?? null),
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

// The first author's surname: "Michael Douglas with Shane Salerno" -> "douglas".
function leadSurname(author: string): string {
  const first = author.split(/,| and | with /i)[0]
  return letters(first.trim().split(/\s+/).at(-1) ?? '')
}

// Words only, for a quoted Solr phrase.
const phrase = (text: string) =>
  text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

// One search that finds every bestseller: by ISBN, which misses new releases whose editions Open
// Library hasn't imported yet, or by title and the lead author's surname.
export function bestsellerQuery(books: Bestseller[]): string {
  const isbns = [...new Set(books.flatMap((book) => book.isbns))]
  const titles = books.map((book) => `(title:"${phrase(book.title)}" AND author:${leadSurname(book.author)})`)
  return [...(isbns.length ? [`isbn:(${isbns.join(' OR ')})`] : []), ...titles].join(' OR ')
}

// Each bestseller's work, in the bestsellers' order: by ISBN, else a work with the same title
// (ignoring a subtitle) by an author with the lead surname. Unmatched books are left out.
export function matchBestsellers(books: Bestseller[], docs: OpenLibrarySearchDoc[]): OpenLibrarySearchDoc[] {
  const byIsbn = new Map<string, OpenLibrarySearchDoc>()
  for (const doc of docs) for (const isbn of doc.isbn ?? []) if (!byIsbn.has(isbn)) byIsbn.set(isbn, doc)
  const seen = new Set<string>()
  const matched: OpenLibrarySearchDoc[] = []
  for (const book of books) {
    const surname = leadSurname(book.author)
    const doc =
      book.isbns.map((isbn) => byIsbn.get(isbn)).find((found) => found) ??
      docs.find(
        (candidate) =>
          letters(candidate.title.split(':')[0]) === letters(book.title) &&
          !!candidate.author_name?.some((name) => letters(name).includes(surname)),
      )
    if (!doc || seen.has(doc.key)) continue
    seen.add(doc.key)
    matched.push(doc)
  }
  return matched
}

async function bestsellers(): Promise<MediaSearchResult[]> {
  const books = await fetchBestsellers()
  if (books.length === 0) return []
  // About 50 books make a query of roughly 3 KB, well within URL limits.
  const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
  url.searchParams.set('q', bestsellerQuery(books))
  url.searchParams.set('limit', '200')
  url.searchParams.set('fields', BESTSELLER_FIELDS)
  const response = await openLibraryFetch(url)
  const data = (await response.json()) as OpenLibrarySearchResponse
  // Works without a cover are new to Open Library and usually lack a description and the rest too.
  return matchBestsellers(books, data.docs)
    .filter((doc) => doc.cover_i)
    .slice(0, POPULAR_LIMIT)
    .map(toSearchResult)
}

export const openLibraryProvider: MediaProvider = {
  async search(query) {
    const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '20')
    url.searchParams.set('lang', 'en')
    url.searchParams.set('fields', SEARCH_FIELDS)

    const response = await openLibraryFetch(url)
    const data = (await response.json()) as OpenLibrarySearchResponse

    return data.docs.map(toSearchResult)
  },
  // The NYT bestsellers when there's a key: Open Library's own trending works are mostly the same
  // self-help classics week after week.
  async popular() {
    if (bestsellersEnabled()) return bestsellers()
    const response = await openLibraryFetch(
      `${OPEN_LIBRARY_BASE}/trending/weekly.json?limit=20&lang=en&fields=${SEARCH_FIELDS}`,
    )
    const data = (await response.json()) as OpenLibraryTrendingResponse
    return data.works.map(toSearchResult)
  },
  async getSeries(externalId) {
    const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
    url.searchParams.set('q', `series_key:${externalId}`)
    url.searchParams.set('limit', String(MAX_SERIES_VOLUMES))
    url.searchParams.set('lang', 'en')
    url.searchParams.set('fields', SEARCH_FIELDS)

    const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    const [seriesResponse, searchResponse] = await Promise.all([
      openLibraryFetch(`${OPEN_LIBRARY_BASE}/series/${externalId}.json`, { signal, allowNotFound: true }),
      openLibraryFetch(url, { signal }),
    ])
    // Only a 404 means there's no such series; anything else is Open Library failing (thrown), which
    // mustn't look like the series is gone.
    if (seriesResponse.status === 404) return null
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
      openLibraryFetch(`${OPEN_LIBRARY_BASE}/works/${externalId}.json`, { allowNotFound: true }),
      fetchIndexEntry(externalId),
    ])
    // Only a 404 means there's no such work: the release check stops tracking titles that come back
    // null, so a rate limit or outage has to throw instead (as openLibraryFetch does).
    if (response.status === 404) return null
    const work = (await response.json()) as OpenLibraryWork
    // A translated work's own description is usually in the original language too, so take the
    // English edition's where it has one (most do).
    const edition = englishEdition(indexEntry, work.title)
    const editionDescription = edition && toDescription((await fetchEdition(edition.key))?.description)

    return {
      externalId,
      type: 'book',
      title: edition?.title ?? work.title,
      coverImageUrl: toCoverUrl(work.covers?.[0]),
      description: editionDescription ?? toDescription(work.description),
      ...releaseFields(
        indexEntry?.publish_date ?? (work.first_publish_date ? [work.first_publish_date] : undefined),
        indexEntry?.first_publish_year ?? yearFromDate(work.first_publish_date),
      ),
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
// Null when the index has no entry for the work. A failed lookup throws instead: the release date
// comes from here, so without it an upcoming book would read as already out (and the release
// check would announce it).
async function fetchIndexEntry(externalId: string): Promise<OpenLibraryIndexEntry | null> {
  const url = new URL(`${OPEN_LIBRARY_BASE}/search.json`)
  url.searchParams.set('q', `key:/works/${externalId}`)
  url.searchParams.set('lang', 'en')
  url.searchParams.set(
    'fields',
    `key,author_name,first_publish_year,publish_date,number_of_pages_median,series_key,series_name,${EDITION_FIELDS}`,
  )

  const response = await openLibraryFetch(url)
  const data = (await response.json()) as { docs: OpenLibraryIndexEntry[] }
  return data.docs[0] ?? null
}

// Only wanted for its description, which is a nice-to-have like the index entry.
async function fetchEdition(editionKey: string): Promise<OpenLibraryEdition | null> {
  try {
    const response = await openLibraryFetch(`${OPEN_LIBRARY_BASE}${editionKey}.json`)
    return (await response.json()) as OpenLibraryEdition
  } catch {
    return null
  }
}
