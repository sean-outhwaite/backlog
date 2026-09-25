import { useEffect, useState } from 'react'
import { AddToListButton } from '../components/AddToListButton'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { api } from '../lib/api'
import type { Recommendation } from '../types'

export function Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const found = await api.get<Recommendation[]>('/api/recommendations')
      setRecommendations(found)
      setLoading(false)
      await Promise.all(found.filter((r) => !r.viewedAt).map((r) => api.patch(`/api/recommendations/${r.id}/viewed`)))
    }
    void load()
  }, [])

  async function addToList(mediaItemId: string) {
    await api.post('/api/lists', { mediaItemId })
    setAddedIds((prev) => new Set(prev).add(mediaItemId))
  }

  return (
    <div>
      <PageHeader title="Recommendations" subtitle="Things your friends think you'd love." />

      {loading && <LoadingState />}
      {!loading && recommendations.length === 0 && (
        <EmptyState>
          <p>No recommendations yet. When a friend sends you something, it'll land here.</p>
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
    </div>
  )
}
