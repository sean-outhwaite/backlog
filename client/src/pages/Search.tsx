import { useState, type FormEvent } from 'react'
import { MediaCard } from '../components/MediaCard'
import { RecommendControl } from '../components/RecommendControl'
import { api } from '../lib/api'
import type { MediaSearchResult, MediaType } from '../types'

const MEDIA_TYPES: Array<MediaType | 'all'> = ['all', 'movie', 'tv', 'book', 'game']

// externalId alone isn't unique across types (a TMDB movie and show can share an id).
function resultKey(result: MediaSearchResult) {
  return `${result.type}:${result.externalId}`
}

export function Search() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [results, setResults] = useState<MediaSearchResult[]>([])
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q: query })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const found = await api.get<MediaSearchResult[]>(`/api/media/search?${params}`)
      setResults(found)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function addToList(result: MediaSearchResult) {
    await api.post('/api/lists', { type: result.type, externalId: result.externalId })
    setAddedIds((prev) => new Set(prev).add(resultKey(result)))
  }

  return (
    <div>
      <form className="page-toolbar" onSubmit={(event) => void handleSearch(event)}>
        <input
          placeholder="Search movies, shows, books, games…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as MediaType | 'all')}>
          {MEDIA_TYPES.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? 'All types' : type}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      <div className="media-grid">
        {results.map((result) => (
          <MediaCard
            key={resultKey(result)}
            mediaItem={result}
            actions={
              <>
                <button onClick={() => void addToList(result)} disabled={addedIds.has(resultKey(result))}>
                  {addedIds.has(resultKey(result)) ? 'Added' : 'Add to list'}
                </button>
                <RecommendControl media={{ type: result.type, externalId: result.externalId }} />
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
