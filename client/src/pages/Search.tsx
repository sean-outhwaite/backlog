import { useState, type FormEvent } from 'react'
import { AddToListButton } from '../components/AddToListButton'
import { SearchIcon } from '../components/icons'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { RecommendControl } from '../components/RecommendControl'
import { LoadingState } from '../components/Spinner'
import { api } from '../lib/api'
import type { MediaSearchResult, MediaType } from '../types'
import { FILTERABLE_MEDIA_TYPES, MEDIA_TYPE_LABELS } from '../lib/mediaTypes'

// externalId alone isn't unique across types (a TMDB movie and show can share an id).
function resultKey(result: MediaSearchResult) {
  return `${result.type}:${result.externalId}`
}

export function Search() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [results, setResults] = useState<MediaSearchResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null)
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
      const found = await api.get<MediaSearchResult[]>(
        `/api/media/search?${params}`,
      )
      setResults(found)
      setSearchedQuery(query)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function addToList(result: MediaSearchResult) {
    await api.post('/api/lists', {
      type: result.type,
      externalId: result.externalId,
    })
    setAddedIds((prev) => new Set(prev).add(resultKey(result)))
  }

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle="Movies, shows, books and games, all in one place."
      />

      <form
        className="page-toolbar search-bar"
        onSubmit={(event) => void handleSearch(event)}
      >
        <label className="search-input">
          <SearchIcon />
          <input
            placeholder="Search movies, shows, books, games…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          value={typeFilter}
          onChange={(event) =>
            setTypeFilter(event.target.value as MediaType | 'all')
          }
        >
          {FILTERABLE_MEDIA_TYPES.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? 'All types' : MEDIA_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {loading && results.length === 0 && <LoadingState label="Searching…" />}
      {!loading && searchedQuery === null && (
        <EmptyState icon={<SearchIcon />}>
          <p>Look something up to start building your backlog.</p>
        </EmptyState>
      )}
      {!loading && searchedQuery !== null && results.length === 0 && (
        <EmptyState icon={<SearchIcon />}>
          <p>Nothing found for “{searchedQuery}”.</p>
        </EmptyState>
      )}

      <div className={`media-grid${loading ? ' is-stale' : ''}`}>
        {results.map((result) => (
          <MediaCard
            key={resultKey(result)}
            mediaItem={result}
            actions={
              <>
                <AddToListButton
                  added={addedIds.has(resultKey(result))}
                  onAdd={() => addToList(result)}
                />
                <RecommendControl
                  media={{ type: result.type, externalId: result.externalId }}
                />
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
