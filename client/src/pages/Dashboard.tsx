import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { RecommendControl } from '../components/RecommendControl'
import { LoadingState } from '../components/Spinner'
import { LogoMark } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { FILTERABLE_MEDIA_TYPES, MEDIA_TYPE_LABELS } from '../lib/mediaTypes'
import type { ListEntry, ListStatus, MediaType } from '../types'

export function Dashboard() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [status, setStatus] = useState<ListStatus>('want')
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [loading, setLoading] = useState(true)

  function load() {
    api
      .get<ListEntry[]>('/api/lists')
      .then(setEntries)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function updateStatus(entry: ListEntry, nextStatus: ListStatus) {
    const updated = await api.patch<ListEntry>(`/api/lists/${entry.id}`, {
      status: nextStatus,
    })
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
  }

  async function removeEntry(entry: ListEntry) {
    await api.delete(`/api/lists/${entry.id}`)
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
  }

  const countFor = (s: ListStatus) =>
    entries.filter((entry) => entry.status === s).length
  const visible = entries.filter(
    (entry) =>
      entry.status === status &&
      (typeFilter === 'all' || entry.mediaItem.type === typeFilter),
  )

  return (
    <div>
      <PageHeader
        title={
          profile?.username ? `${profile.username}'s backlog` : 'My backlog'
        }
        subtitle="Everything you've been meaning to watch, read and play."
      />

      <div className="page-toolbar">
        <div className="tabs">
          <button
            className={status === 'want' ? 'active' : ''}
            onClick={() => setStatus('want')}
          >
            Up next <span className="tab-count">{countFor('want')}</span>
          </button>
          <button
            className={status === 'done' ? 'active' : ''}
            onClick={() => setStatus('done')}
          >
            Done <span className="tab-count">{countFor('done')}</span>
          </button>
        </div>
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
      </div>

      {loading && <LoadingState />}
      {!loading && visible.length === 0 && (
        <EmptyState icon={<LogoMark />}>
          {status === 'want' ? (
            <p>
              Your backlog is empty.{' '}
              <Link to="/search">Find something to add</Link>.
            </p>
          ) : (
            <p>
              Nothing finished yet. Mark something done and it'll show up here.
            </p>
          )}
        </EmptyState>
      )}

      <div className="media-grid">
        {visible.map((entry) => (
          <MediaCard
            key={entry.id}
            mediaItem={entry.mediaItem}
            actions={
              <>
                <button
                  className={entry.status === 'want' ? 'btn-primary' : ''}
                  onClick={() =>
                    void updateStatus(
                      entry,
                      entry.status === 'want' ? 'done' : 'want',
                    )
                  }
                >
                  {entry.status === 'want'
                    ? 'Mark done'
                    : 'Move back to up next'}
                </button>
                <button
                  className="btn-quiet btn-danger"
                  onClick={() => void removeEntry(entry)}
                >
                  Remove
                </button>
                <RecommendControl media={{ mediaItemId: entry.mediaItem.id }} />
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
