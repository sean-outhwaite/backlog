import { resultKey, seriesKey } from '../hooks/usePopular'
import { isUpcoming } from '../lib/release'
import type { ListStatus, MediaSearchResult } from '../types'
import { AddToListButton } from './AddToListButton'
import { SeriesIcon } from './icons'
import { MediaCard } from './MediaCard'

// A search or popular result, with Add (and, for a series volume, Add series) buttons.
export function ResultCard({
  result,
  listed,
  onAdd,
  onAddSeries,
}: {
  result: MediaSearchResult
  listed: Map<string, ListStatus>
  onAdd: (result: MediaSearchResult, status: ListStatus) => Promise<void>
  onAddSeries: (result: MediaSearchResult, status: ListStatus) => Promise<void>
}) {
  return (
    <MediaCard
      mediaItem={result}
      stackCovers={result.covers}
      partCount={result.volumeCount}
      platforms={result.platforms}
      offerSeries={!result.series}
      recommend={{ type: result.type, externalId: result.externalId, kind: result.kind }}
      actions={
        <>
          <AddToListButton
            added={listed.get(resultKey(result)) ?? false}
            onAdd={(status) => onAdd(result, status)}
            upcoming={isUpcoming(result)}
            label={result.kind === 'series' ? 'Add series' : undefined}
          />
          {result.series && (
            <AddToListButton
              added={listed.get(seriesKey(result.type, result.series.externalId)) ?? false}
              onAdd={(status) => onAddSeries(result, status)}
              label="Add series"
              icon={<SeriesIcon />}
              primary={false}
              title={`Add the whole ${result.series.title} series, and track it volume by volume`}
            />
          )}
        </>
      }
    />
  )
}
