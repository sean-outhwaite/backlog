import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CollectionCard } from '../components/CollectionCard'
import { CollectionFormDialog } from '../components/CollectionFormDialog'
import { PlusIcon } from '../components/icons'
import { PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { api } from '../lib/api'
import type { CollectionSummary } from '../types'

export function Lists() {
  const navigate = useNavigate()
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api
      .get<CollectionSummary[]>('/api/collections')
      .then(setCollections)
      .catch(() => setFailed(true))
  }, [])

  async function create(values: { name: string; description: string }) {
    const created = await api.post<CollectionSummary>('/api/collections', values)
    navigate(`/lists/${created.id}`)
  }

  return (
    <div>
      <div className="page-header-row">
        <PageHeader
          title="Lists"
          subtitle="Collections your friends can browse. Your picks show up on their Recommendations page."
        />
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <PlusIcon />
          New list
        </button>
      </div>

      {failed && <p className="error-text">Couldn't load your lists.</p>}
      {!collections && !failed && <LoadingState />}
      {collections && (
        <>
          <div className="media-grid">
            {collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        </>
      )}

      {creating && (
        <CollectionFormDialog
          title="New list"
          submitLabel="Create list"
          onSubmit={create}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}
