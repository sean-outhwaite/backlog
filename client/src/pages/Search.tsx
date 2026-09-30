import { useState, type FormEvent } from 'react'
import { AddToListButton } from '../components/AddToListButton'
import { SearchIcon, SeriesIcon } from '../components/icons'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { RecommendControl } from '../components/RecommendControl'
import { LoadingState } from '../components/Spinner'
import { resultKey, seriesKey, usePopular } from '../hooks/usePopular'
import { api } from '../lib/api'
import type { MediaSearchResult, MediaType } from '../types'
import { FILTERABLE_MEDIA_TYPES, MEDIA_TYPE_LABELS } from '../lib/mediaTypes'

export function Search() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [results, setResults] = useState<MediaSearchResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Before the first search, show what's popular for the selected type instead of an empty page.
  const popular = usePopular(typeFilter)

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
      kind: result.kind,
    })
    setAddedIds((prev) => new Set(prev).add(resultKey(result)))
  }

  // Keyed by series rather than result, so every volume's card shows the series as added.
  async function addSeries(result: MediaSearchResult, series: NonNullable<MediaSearchResult['series']>) {
    await api.post('/api/lists', { type: result.type, externalId: series.externalId, kind: 'series' })
    setAddedIds((prev) => new Set(prev).add(seriesKey(result.type, series.externalId)))
  }

  return (
    <div>
      <PageHeader title="Search" subtitle="Movies, shows, books and games, all in one place." />

      <form className="page-toolbar search-bar" onSubmit={(event) => void handleSearch(event)}>
        <label className="search-input">
          <SearchIcon />
          <input
            placeholder="Search movies, shows, books, games…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              // Clearing the box goes back to the popular suggestions.
              if (!event.target.value) {
                setSearchedQuery(null)
                setResults([])
              }
            }}
          />
        </label>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as MediaType | 'all')}>
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
      {!loading && searchedQuery === null && popular === null && <LoadingState label="Loading popular titles…" />}
      {!loading && searchedQuery === null && popular?.length === 0 && (
        <EmptyState icon={<SearchIcon />}>
          <p>Look something up to start building your backlog.</p>
        </EmptyState>
      )}
      {!loading && searchedQuery === null && !!popular?.length && <h2>Popular right now</h2>}
      {!loading && searchedQuery !== null && results.length === 0 && (
        <EmptyState icon={<SearchIcon />}>
          <p>Nothing found for “{searchedQuery}”.</p>
        </EmptyState>
      )}

      <div className={`media-grid${loading ? ' is-stale' : ''}`}>
        {(searchedQuery === null && !loading ? (popular ?? []) : results).map((result) => (
          <MediaCard
            key={resultKey(result)}
            mediaItem={result}
            stackCovers={result.covers}
            partCount={result.volumeCount}
            offerSeries={!result.series}
            actions={
              <>
                <AddToListButton
                  added={addedIds.has(resultKey(result))}
                  onAdd={() => addToList(result)}
                  label={result.kind === 'series' ? 'Add series' : undefined}
                />
                {result.series && (
                  <AddToListButton
                    added={addedIds.has(seriesKey(result.type, result.series.externalId))}
                    onAdd={() => addSeries(result, result.series!)}
                    label="Add series"
                    icon={<SeriesIcon />}
                    primary={false}
                    title={`Add the whole ${result.series.title} series, and track it volume by volume`}
                  />
                )}
                <RecommendControl media={{ type: result.type, externalId: result.externalId, kind: result.kind }} />
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
