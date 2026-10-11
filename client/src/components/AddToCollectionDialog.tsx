import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import type { CollectionItem, CollectionSummary, MediaRef } from '../types'
import { CheckIcon, PlusIcon, StarIcon } from './icons'
import { Spinner } from './Spinner'

type Containing = { mediaItemId: string | null; collections: CollectionSummary[] }

// Puts a title on (or takes it off) any of your lists, picks first. Each toggle saves straight away;
// the note goes with whatever's added while it's filled in.
export function AddToCollectionDialog({
  media,
  title,
  onClose,
}: {
  media: MediaRef
  title: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [data, setData] = useState<Containing | null>(null)
  const [failed, setFailed] = useState(false)
  // Lists with a save in flight, so their toggle can't be hit twice.
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [newName, setNewName] = useState('')

  useEffect(() => {
    // Guarded because StrictMode runs this twice, and showModal throws on an open dialog.
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // A string rather than media itself, which is a fresh object on every render.
  const query = new URLSearchParams(
    'mediaItemId' in media
      ? { mediaItemId: media.mediaItemId }
      : { type: media.type, externalId: media.externalId, kind: media.kind ?? 'title' },
  ).toString()
  useEffect(() => {
    api
      .get<Containing>(`/api/collections/containing?${query}`)
      .then(setData)
      .catch(() => setFailed(true))
  }, [query])

  const close = () => dialogRef.current?.close()

  function patch(collectionId: string, changes: Partial<CollectionSummary>, mediaItemId?: string) {
    setData(
      (current) =>
        current && {
          mediaItemId: mediaItemId ?? current.mediaItemId,
          collections: current.collections.map((collection) =>
            collection.id === collectionId ? { ...collection, ...changes } : collection,
          ),
        },
    )
  }

  async function toggle(collection: CollectionSummary) {
    setBusy((current) => new Set(current).add(collection.id))
    setFailed(false)
    try {
      if (collection.contains && data?.mediaItemId) {
        await api.delete(`/api/collections/${collection.id}/items/${data.mediaItemId}`)
        patch(collection.id, { contains: false, itemCount: collection.itemCount - 1 })
      } else {
        const item = await api.post<CollectionItem>(`/api/collections/${collection.id}/items`, {
          ...media,
          note: note.trim() || undefined,
        })
        patch(collection.id, { contains: true, itemCount: collection.itemCount + 1 }, item.mediaItemId)
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy((current) => {
        const next = new Set(current)
        next.delete(collection.id)
        return next
      })
    }
  }

  async function createAndAdd(event: FormEvent) {
    event.preventDefault()
    if (!newName.trim()) return
    try {
      const created = await api.post<CollectionSummary>('/api/collections', { name: newName.trim() })
      setData((current) => current && { ...current, collections: [...current.collections, created] })
      setNewName('')
      await toggle(created)
    } catch {
      setFailed(true)
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby={headingId}
      onClose={(event) => {
        // React bubbles close through the portal to its owner, the details dialog.
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <div className="confirm collection-picker">
        <h2 id={headingId}>Add to a list</h2>
        <p className="collection-picker-title">{title}</p>

        <label className="collection-picker-note">
          <span>
            Note <span className="optional">(optional, friends see it)</span>
          </span>
          <textarea
            maxLength={280}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why it's worth it"
          />
        </label>

        {!data && !failed && <Spinner />}
        {data && (
          <ul className="collection-picker-lists">
            {data.collections.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button"
                  className={`collection-picker-row${collection.contains ? ' is-on' : ''}`}
                  aria-pressed={!!collection.contains}
                  disabled={busy.has(collection.id)}
                  onClick={() => void toggle(collection)}
                >
                  <span className="collection-picker-check" aria-hidden="true">
                    {busy.has(collection.id) ? <Spinner /> : collection.contains ? <CheckIcon /> : <PlusIcon />}
                  </span>
                  <span className="collection-picker-name">
                    {collection.kind === 'picks' && <StarIcon />}
                    {collection.name}
                    {collection.kind === 'picks' && (
                      <span className="collection-picker-hint">Shown to all your friends</span>
                    )}
                  </span>
                  <span className="collection-picker-count">{collection.itemCount}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="collection-picker-new" onSubmit={(event) => void createAndAdd(event)}>
          <input
            maxLength={60}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New list…"
            aria-label="New list name"
          />
          <button type="submit" className="btn-quiet" disabled={!newName.trim() || !data}>
            Create
          </button>
        </form>

        {failed && <p className="error-text">That didn't work. Try again?</p>}
        <footer className="confirm-footer">
          <button type="button" className="btn-primary" onClick={close}>
            Done
          </button>
        </footer>
      </div>
    </dialog>,
    document.body,
  )
}
