import type { MediaSearchResult } from '../providers/types.js'

// Lowercase, strip accents and punctuation, collapse whitespace, so "METAL GEAR SOLID"
// and "Metal Gear Solid:" compare equal.
function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Up to 3: an exact title match beats a prefix match ("Harry Potter and the ..."), which
// beats partial word overlap. coverage is the fraction (0..1) of query words in the title.
function titleMatchScore(title: string, query: string): { score: number; coverage: number } {
  const normalizedTitle = normalize(title)
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return { score: 0, coverage: 0 }

  const titleWords = new Set(normalizedTitle.split(' '))
  const queryWords = normalizedQuery.split(' ')
  const coverage = queryWords.filter((word) => titleWords.has(word)).length / queryWords.length

  if (normalizedTitle === normalizedQuery) return { score: 3, coverage }
  if (normalizedTitle.startsWith(`${normalizedQuery} `)) return { score: 2.5, coverage }
  return { score: 2 * coverage, coverage }
}

// Providers each rank their own results well, but their orders can't be compared, and
// several providers often have an exact title match (e.g. "Metal Gear Solid" is a game,
// a fan film and a book). So score every result by title match plus log-scaled popularity,
// which is what separates the famous game from the obscure fan film. Popularity is scaled
// by how much of the query the title covers, so a popular but unrelated title (Open Library
// matches on body text, e.g. "Atomic Habits" for "breaking bad") can't float to the top.
export function rankSearchResults<T extends MediaSearchResult>(results: T[], query: string): T[] {
  return results
    .map((result, providerRank) => {
      const { score, coverage } = titleMatchScore(result.title, query)
      return { result, providerRank, score: score + coverage * Math.log10(1 + result.popularity) }
    })
    .sort((a, b) => b.score - a.score || a.providerRank - b.providerRank)
    .map(({ result }) => result)
}
