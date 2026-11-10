import { Link, useSearchParams } from 'react-router-dom'
import { SearchIcon } from '../components/icons'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { ResultCard } from '../components/ResultCard'
import { LoadingState } from '../components/Spinner'
import { TypeSelect } from '../components/TypeSelect'
import { useListed } from '../hooks/useListed'
import { resultKey, usePopular } from '../hooks/usePopular'
import { MEDIA_TYPE_LABELS } from '../lib/mediaTypes'
import type { MediaType } from '../types'

function isMediaType(value: string | null): value is MediaType {
  return !!value && value in MEDIA_TYPE_LABELS
}

// The whole popular list (Search shows a short preview). All types mixes every type's full list.
export function Trending() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('type')
  const type: MediaType | 'all' = isMediaType(param) ? param : 'all'
  const { listed, addResult, addSeries } = useListed()
  const popular = usePopular(type, true, true)

  return (
    <div>
      <Link to="/search" className="back-link">
        ← Search
      </Link>
      <PageHeader title="Trending" subtitle="All aboard the hype train." />

      <div className="page-toolbar">
        <TypeSelect
          value={type}
          onChange={(next) => setSearchParams(next === 'all' ? {} : { type: next }, { replace: true })}
        />
      </div>

      {popular === null && <LoadingState label="Loading trending titles…" />}
      {popular?.length === 0 && (
        <EmptyState icon={<SearchIcon />}>
          <p>Couldn't load what's trending right now. Try again in a bit.</p>
        </EmptyState>
      )}
      {!!popular?.length && (
        <div className="media-grid">
          {popular.map((result) => (
            <ResultCard
              key={resultKey(result)}
              result={result}
              listed={listed}
              onAdd={addResult}
              onAddSeries={addSeries}
            />
          ))}
        </div>
      )}
    </div>
  )
}
