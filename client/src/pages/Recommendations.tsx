import { useEffect, useState } from 'react'
import { AddToListButton } from '../components/AddToListButton'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { RecommendControl } from '../components/RecommendControl'
import { LoadingState } from '../components/Spinner'
import { resultKey, usePopular } from '../hooks/usePopular'
import { api } from '../lib/api'
import type { ListEntry, MediaSearchResult, Recommendation } from '../types'

export function Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  // A recommendation is pending until its title is on your list. Decided once on load, so
  // adding one here doesn't make popular titles pop in underneath mid-visit.
  const [hasPending, setHasPending] = useState(true)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const popular = usePopular('all', !loading && !hasPending)

  useEffect(() => {
    async function load() {
      const [found, entries] = await Promise.all([
        api.get<Recommendation[]>('/api/recommendations'),
        api.get<ListEntry[]>('/api/lists'),
      ])
      const onList = new Set(entries.map((entry) => entry.mediaItemId))
      setRecommendations(found)
      setHasPending(found.some((rec) => !onList.has(rec.mediaItemId)))
      setLoading(false)
      await Promise.all(found.filter((r) => !r.viewedAt).map((r) => api.patch(`/api/recommendations/${r.id}/viewed`)))
    }
    void load()
  }, [])

  async function addToList(mediaItemId: string) {
    await api.post('/api/lists', { mediaItemId })
    setAddedIds((prev) => new Set(prev).add(mediaItemId))
  }

  async function addPopularToList(result: MediaSearchResult) {
    await api.post('/api/lists', { type: result.type, externalId: result.externalId })
    setAddedIds((prev) => new Set(prev).add(resultKey(result)))
  }

  // Shown in place of the empty state, or under the recommendations once none are pending.
  const popularGrid = !!popular?.length && (
    <div className="media-grid">
      {popular.map((result) => (
        <MediaCard
          key={resultKey(result)}
          mediaItem={result}
          actions={
            <>
              <AddToListButton added={addedIds.has(resultKey(result))} onAdd={() => addPopularToList(result)} />
              <RecommendControl media={{ type: result.type, externalId: result.externalId }} title={result.title} />
            </>
          }
        />
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader title="Recommendations" subtitle="Things your friends think you'd love." />

      {loading && <LoadingState />}
      {!loading && recommendations.length === 0 && (
        <EmptyState className={popularGrid ? 'empty-state--popular' : undefined}>
          {popularGrid ? (
            <>
              <p>No recommendations from friends yet, but check out these popular titles.</p>
              {popularGrid}
            </>
          ) : (
            <p>No recommendations yet. When a friend sends you something, it'll land here.</p>
          )}
        </EmptyState>
      )}

      <div className="media-grid">
        {recommendations.map((rec) => (
          <MediaCard
            key={rec.id}
            mediaItem={rec.mediaItem}
            actions={
              <>
                <p className="recommendation-from">
                  <span className="avatar avatar--sm" aria-hidden="true">
                    {rec.fromUser.username?.[0]?.toUpperCase()}
                  </span>
                  From <strong>{rec.fromUser.username}</strong>
                </p>
                {rec.message && <p className="recommendation-message">“{rec.message}”</p>}
                <AddToListButton added={addedIds.has(rec.mediaItemId)} onAdd={() => addToList(rec.mediaItemId)} />
              </>
            }
          />
        ))}
      </div>

      {recommendations.length > 0 && popularGrid && (
        <EmptyState className="empty-state--popular">
          <p>You're all caught up on recommendations. Here's what's popular right now.</p>
          {popularGrid}
        </EmptyState>
      )}
    </div>
  )
}
