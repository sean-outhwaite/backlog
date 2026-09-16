import { useEffect, useState } from 'react'
import { MediaCard } from '../components/MediaCard'
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
      await Promise.all(
        found.filter((r) => !r.viewedAt).map((r) => api.patch(`/api/recommendations/${r.id}/viewed`)),
      )
    }
    void load()
  }, [])

  async function addToList(mediaItemId: string) {
    await api.post('/api/lists', { mediaItemId })
    setAddedIds((prev) => new Set(prev).add(mediaItemId))
  }

  if (loading) return <p className="page-status">Loading…</p>
  if (recommendations.length === 0) return <p className="page-status">No recommendations yet.</p>

  return (
    <div className="media-grid">
      {recommendations.map((rec) => (
        <MediaCard
          key={rec.id}
          mediaItem={rec.mediaItem}
          actions={
            <>
              <p>From {rec.fromUser.username}</p>
              {rec.message && <p className="recommendation-message">"{rec.message}"</p>}
              <button onClick={() => void addToList(rec.mediaItemId)} disabled={addedIds.has(rec.mediaItemId)}>
                {addedIds.has(rec.mediaItemId) ? 'Added' : 'Add to my list'}
              </button>
            </>
          }
        />
      ))}
    </div>
  )
}
