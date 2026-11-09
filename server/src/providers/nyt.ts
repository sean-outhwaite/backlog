import { env } from '../lib/env.js'
import { providerFetch } from './types.js'

// The New York Times Best Sellers lists, for the books shown before searching. Ranked by the week's
// sales, so older books come back when they sell again (a film adaptation, BookTok). Only the API
// key is needed (developer.nytimes.com, with the Books API enabled on the app); the secret is
// for OAuth, which the Books API doesn't use. The lists change weekly.
const NYT_OVERVIEW_URL = 'https://api.nytimes.com/svc/books/v3/lists/overview.json'

// Weekly lists, in the order they're interleaved. The combined lists cover new releases across
// formats; paperback fiction is where older books selling again turn up; young adult has little
// overlap with the others.
const LISTS = [
  'combined-print-and-e-book-fiction',
  'combined-print-and-e-book-nonfiction',
  'trade-fiction-paperback',
  'young-adult-hardcover',
]

export interface Bestseller {
  // As NYT gives it: upper case ("THE HOLLOW").
  title: string
  // Possibly several people ("Ben Meiselas, Brett Meiselas", "Michael Douglas with Shane Salerno").
  author: string
  isbns: string[]
}

interface NytBook {
  title: string
  author: string
  primary_isbn13: string
  isbns: Array<{ isbn13: string }>
}

interface NytOverview {
  results: { lists: Array<{ list_name_encoded: string; books: NytBook[] }> }
}

export const bestsellersEnabled = (): boolean => !!env.nytApiKey

// The lists' books interleaved by rank (each list's #1, then each #2, ...), each book once.
export function interleaveBestsellers(overview: NytOverview): Bestseller[] {
  const lists = LISTS.map((name) => overview.results.lists.find((list) => list.list_name_encoded === name)?.books ?? [])
  const seen = new Set<string>()
  const books: Bestseller[] = []
  const longest = Math.max(0, ...lists.map((list) => list.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const book = list[i]
      if (!book) continue
      const key = `${book.title}|${book.author}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const isbns = [...new Set([book.primary_isbn13, ...book.isbns.map((isbn) => isbn.isbn13)].filter(Boolean))]
      books.push({ title: book.title, author: book.author, isbns })
    }
  }
  return books
}

export async function fetchBestsellers(): Promise<Bestseller[]> {
  const url = new URL(NYT_OVERVIEW_URL)
  url.searchParams.set('api-key', env.nytApiKey ?? '')
  const response = await providerFetch('NYT', url)
  return interleaveBestsellers((await response.json()) as NytOverview)
}
