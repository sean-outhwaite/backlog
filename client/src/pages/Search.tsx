import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AddToListButton } from '../components/AddToListButton'
import { FriendsPopularCarousel } from '../components/FriendsPopularCarousel'
import { SearchIcon, SeriesIcon } from '../components/icons'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { TypeSelect } from '../components/TypeSelect'
import { listedKeys, resultKey, seriesKey, useFriendsPopular, usePopular } from '../hooks/usePopular'
import { api } from '../lib/api'
import { isUpcoming } from '../lib/release'
import type { ListEntry, ListStatus, MediaItem, MediaSearchResult, MediaType } from '../types'

export function Search() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [results, setResults] = useState<MediaSearchResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<ListEntry[]>('/api/lists')
      .then((entries) => setAddedIds((prev) => new Set([...prev, ...listedKeys(entries)])))
      .catch(() => {})
  }, [])

  // Before the first search, show what's popular for the selected type instead of an empty page:
  // first what your friends have, then what's popular generally (minus anything already shown above).
  const friendsPopular = useFriendsPopular(typeFilter)
  const generalPopular = usePopular(typeFilter)
  const friendsKeys = new Set(friendsPopular?.map((item) => resultKey(item.mediaItem)))
  const popular = generalPopular && generalPopular.filter((result) => !friendsKeys.has(resultKey(result)))

  // Changing the filter mid-search can leave two requests in flight; only the latest one may land.
  const latestSearch = useRef(0)

  async function runSearch(searchQuery: string, type: MediaType | 'all') {
    if (!searchQuery.trim()) return
    const searchId = ++latestSearch.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q: searchQuery })
      if (type !== 'all') params.set('type', type)
      const found = await api.get<MediaSearchResult[]>(`/api/media/search?${params}`)
      if (searchId !== latestSearch.current) return
      setResults(found)
      setSearchedQuery(searchQuery)
    } catch (err) {
      if (searchId !== latestSearch.current) return
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      if (searchId === latestSearch.current) setLoading(false)
    }
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    void runSearch(query, typeFilter)
  }

  // With a query in the box, a new filter applies straight away; with an empty box it just switches the popular list.
  function handleTypeChange(type: MediaType | 'all') {
    setTypeFilter(type)
    void runSearch(query, type)
  }

  async function addToList(result: MediaSearchResult, status: ListStatus) {
    await api.post('/api/lists', {
      type: result.type,
      externalId: result.externalId,
      kind: result.kind,
      status,
    })
    setAddedIds((prev) => new Set(prev).add(resultKey(result)))
  }

  async function addFriendsPick(mediaItem: MediaItem, status: ListStatus) {
    await api.post('/api/lists', { mediaItemId: mediaItem.id, status })
    setAddedIds((prev) => new Set(prev).add(resultKey(mediaItem)))
  }

  // Keyed by series rather than result, so every volume's card shows the series as added.
  async function addSeries(
    result: MediaSearchResult,
    series: NonNullable<MediaSearchResult['series']>,
    status: ListStatus,
  ) {
    await api.post('/api/lists', { type: result.type, externalId: series.externalId, kind: 'series', status })
    setAddedIds((prev) => new Set(prev).add(seriesKey(result.type, series.externalId)))
  }

  return (
    <div>
      <PageHeader title="Search" subtitle="Find your next favourite." />

      <form className="page-toolbar search-bar" onSubmit={handleSearch}>
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
        <TypeSelect value={typeFilter} onChange={handleTypeChange} />
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
      {!loading && searchedQuery === null && !!friendsPopular?.length && (
        <section className="popular-section">
          <h2>Popular with your friends</h2>
          <FriendsPopularCarousel items={friendsPopular} addedKeys={addedIds} onAdd={addFriendsPick} />
        </section>
      )}
      {!loading && searchedQuery === null && !!popular?.length && <h2>Trending now</h2>}
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
            recommend={{ type: result.type, externalId: result.externalId, kind: result.kind }}
            actions={
              <>
                <AddToListButton
                  added={addedIds.has(resultKey(result))}
                  onAdd={(status) => addToList(result, status)}
                  upcoming={isUpcoming(result)}
                  label={result.kind === 'series' ? 'Add series' : undefined}
                />
                {result.series && (
                  <AddToListButton
                    added={addedIds.has(seriesKey(result.type, result.series.externalId))}
                    onAdd={(status) => addSeries(result, result.series!, status)}
                    label="Add series"
                    icon={<SeriesIcon />}
                    primary={false}
                    title={`Add the whole ${result.series.title} series, and track it volume by volume`}
                  />
                )}
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
