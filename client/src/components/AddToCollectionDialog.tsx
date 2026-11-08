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
  // Lists this title was added to while the dialog is open, with the note each was last saved with,
  // so a note typed after ticking a list still reaches it (lists it was already on keep theirs).
  const savedNotes = useRef(new Map<string, string | null>())

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
        savedNotes.current.delete(collection.id)
        patch(collection.id, { contains: false, itemCount: collection.itemCount - 1 })
      } else {
        const sent = note.trim() || null
        const item = await api.post<CollectionItem>(`/api/collections/${collection.id}/items`, {
          ...media,
          note: sent ?? undefined,
        })
        savedNotes.current.set(collection.id, sent)
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

  // Brings the lists added here up to date with the note as it now reads. Runs when the note loses
  // focus and again on close (Escape doesn't blur it); the map is updated first so it doesn't repeat.
  function syncNote() {
    const mediaItemId = data?.mediaItemId
    if (!mediaItemId) return
    const current = note.trim() || null
    for (const [collectionId, saved] of savedNotes.current) {
      if (saved === current) continue
      savedNotes.current.set(collectionId, current)
      api
        .patch(`/api/collections/${collectionId}/items/${mediaItemId}`, { note: current })
        .catch(() => {
          savedNotes.current.set(collectionId, saved)
          setFailed(true)
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
        syncNote()
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
            onBlur={syncNote}
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
