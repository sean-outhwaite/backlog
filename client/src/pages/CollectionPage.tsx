import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AddToListButton } from '../components/AddToListButton'
import { Avatar } from '../components/Avatar'
import { CollectionFormDialog } from '../components/CollectionFormDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EntryMenu } from '../components/EntryMenu'
import { PencilIcon, TrashIcon } from '../components/icons'
import { MediaCard } from '../components/MediaCard'
import { NoteEditor } from '../components/NoteEditor'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { api, ApiError } from '../lib/api'
import type { CollectionDetail, ListEntry } from '../types'

// One list, yours (editable) or a friend's (with add-to-backlog buttons).
export function CollectionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Media item ids on your backlog, so a friend's titles you already have show as added.
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .get<CollectionDetail>(`/api/collections/${id}`)
      .then((found) => {
        if (cancelled) return
        setCollection(found)
        setStatus('ready')
      })
      .catch(
        (error) => !cancelled && setStatus(error instanceof ApiError && error.status === 404 ? 'missing' : 'failed'),
      )
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    api
      .get<ListEntry[]>('/api/lists')
      .then((own) => setAddedIds((prev) => new Set([...prev, ...own.map((entry) => entry.mediaItemId)])))
      .catch(() => {})
  }, [])

  if (status === 'loading') return <LoadingState />
  if (status !== 'ready' || !collection) {
    return (
      <div>
        <Link to="/lists" className="back-link">
          ← Lists
        </Link>
        <EmptyState>
          <p>{status === 'missing' ? "This list isn't available." : "Couldn't load this list."}</p>
        </EmptyState>
      </div>
    )
  }

  const { isOwn, owner, items } = collection
  const isPicks = collection.kind === 'picks'

  async function addToBacklog(mediaItemId: string) {
    await api.post('/api/lists', { mediaItemId })
    setAddedIds((prev) => new Set(prev).add(mediaItemId))
  }

  async function saveNote(mediaItemId: string, note: string | null) {
    await api.patch(`/api/collections/${collection!.id}/items/${mediaItemId}`, { note })
    setCollection(
      (current) =>
        current && {
          ...current,
          items: current.items.map((item) => (item.mediaItemId === mediaItemId ? { ...item, note } : item)),
        },
    )
  }

  async function removeItem(mediaItemId: string) {
    await api.delete(`/api/collections/${collection!.id}/items/${mediaItemId}`)
    setCollection(
      (current) => current && { ...current, items: current.items.filter((item) => item.mediaItemId !== mediaItemId) },
    )
  }

  async function saveDetails(values: { name: string; description: string }) {
    const updated = await api.patch<CollectionDetail>(`/api/collections/${collection!.id}`, {
      ...(isPicks ? {} : { name: values.name }),
      description: values.description || null,
    })
    setCollection((current) => current && { ...current, name: updated.name, description: updated.description })
  }

  async function deleteCollection() {
    await api.delete(`/api/collections/${collection!.id}`)
    navigate('/lists', { replace: true })
  }

  return (
    <div>
      {isOwn ? (
        <Link to="/lists" className="back-link">
          ← Lists
        </Link>
      ) : (
        <Link to={`/friends/${owner.id}/lists`} className="back-link">
          ← {owner.username ?? 'Their'}'s lists
        </Link>
      )}

      <div className="page-header-row">
        <PageHeader
          title={
            isOwn ? (
              collection.name
            ) : (
              <span className="friend-heading">
                <Avatar profile={owner} size="lg" />
                {isPicks ? `${owner.username ?? 'Their'}'s picks` : collection.name}
              </span>
            )
          }
          subtitle={
            collection.description ??
            (isPicks
              ? isOwn
                ? 'What you’d recommend to all your friends. They see these on their Recommendations page.'
                : `What ${owner.username ?? 'they'} would recommend to all their friends.`
              : undefined)
          }
        />
        {isOwn && (
          <div className="page-header-actions">
            <button className="btn-quiet" onClick={() => setEditing(true)}>
              <PencilIcon />
              Edit
            </button>
            {!isPicks && (
              <button className="btn-quiet btn-danger" onClick={() => setDeleting(true)}>
                <TrashIcon />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {items.length === 0 && (
        <EmptyState>
          <p>{isOwn ? 'Nothing here yet. Open any title and choose “Add to a list”.' : 'Nothing on this list yet.'}</p>
        </EmptyState>
      )}

      <div className="media-grid">
        {items.map((item) => (
          <MediaCard
            key={item.mediaItemId}
            mediaItem={item.mediaItem}
            coverActions={
              isOwn && (
                <EntryMenu
                  onRemove={() => void removeItem(item.mediaItemId)}
                  label="Remove from list"
                  triggerLabel={`More actions for ${item.mediaItem.title}`}
                />
              )
            }
            actions={
              <>
                <NoteEditor note={item.note} editable={isOwn} onSave={(note) => saveNote(item.mediaItemId, note)} />
                {!isOwn && (
                  <AddToListButton
                    added={addedIds.has(item.mediaItemId)}
                    onAdd={() => addToBacklog(item.mediaItemId)}
                  />
                )}
              </>
            }
          />
        ))}
      </div>

      {editing && (
        <CollectionFormDialog
          title={isPicks ? 'Describe your picks' : 'Edit list'}
          submitLabel="Save"
          initial={{ name: collection.name, description: collection.description ?? '' }}
          nameEditable={!isPicks}
          onSubmit={saveDetails}
          onClose={() => setEditing(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${collection.name}”?`}
          confirmLabel="Delete list"
          danger
          onConfirm={deleteCollection}
          onClose={() => setDeleting(false)}
        >
          <p>Only the list goes; your backlog isn't affected.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
