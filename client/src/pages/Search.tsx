import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FriendsPopularCarousel } from '../components/FriendsPopularCarousel'
import { ChevronRightIcon, SearchIcon } from '../components/icons'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { ResultCard } from '../components/ResultCard'
import { LoadingState } from '../components/Spinner'
import { TypeSelect } from '../components/TypeSelect'
import { useListed } from '../hooks/useListed'
import { resultKey, useFriendsPopular, usePopular } from '../hooks/usePopular'
import { api } from '../lib/api'
import type { MediaSearchResult, MediaType } from '../types'

// How many trending titles Search shows before "See all".
const TRENDING_PREVIEW_COUNT = 12

export function Search() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [results, setResults] = useState<MediaSearchResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null)
  const { listed, addResult, addMediaItem, addSeries } = useListed()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Before the first search, show what's popular for the selected type instead of an empty page:
  // first what your friends have, then what's popular generally (minus anything already shown above).
  const friendsPopular = useFriendsPopular(typeFilter)
  const generalPopular = usePopular(typeFilter)
  const friendsKeys = new Set(friendsPopular?.map((item) => resultKey(item.mediaItem)))
  // Only a preview: the whole list is on the Trending page, linked from the heading.
  const popular =
    generalPopular &&
    generalPopular.filter((result) => !friendsKeys.has(resultKey(result))).slice(0, TRENDING_PREVIEW_COUNT)

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
          <FriendsPopularCarousel items={friendsPopular} listed={listed} onAdd={addMediaItem} />
        </section>
      )}
      {!loading && searchedQuery === null && !!popular?.length && (
        <div className="section-heading">
          <h2>Trending now</h2>
          <Link to={typeFilter === 'all' ? '/search/trending' : `/search/trending?type=${typeFilter}`} className="see-all-link">
            See all
            <ChevronRightIcon />
          </Link>
        </div>
      )}
      {!loading && searchedQuery !== null && results.length === 0 && (
        <EmptyState icon={<SearchIcon />}>
          <p>Nothing found for “{searchedQuery}”.</p>
        </EmptyState>
      )}

      <div className={`media-grid${loading ? ' is-stale' : ''}`}>
        {(searchedQuery === null && !loading ? (popular ?? []) : results).map((result) => (
          <ResultCard key={resultKey(result)} result={result} listed={listed} onAdd={addResult} onAddSeries={addSeries} />
        ))}
      </div>
    </div>
  )
}
