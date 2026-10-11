import { useState, type FormEvent } from 'react'
import { PencilIcon } from './icons'

// A list item's note, as friends see it, with an inline editor for the list's owner.
export function NoteEditor({
  note,
  editable,
  onSave,
}: {
  note: string | null
  editable: boolean
  onSave: (note: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(draft.trim() || null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form className="note-editor" onSubmit={(event) => void handleSubmit(event)}>
        <textarea
          maxLength={280}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Note"
          placeholder="Why it's worth it"
          autoFocus
        />
        <div className="note-editor-actions">
          <button type="button" className="btn-quiet" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            Save
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      {note && <p className="recommendation-message">“{note}”</p>}
      {editable && (
        <button
          type="button"
          className="btn-quiet note-editor-trigger"
          onClick={() => {
            setDraft(note ?? '')
            setEditing(true)
          }}
        >
          <PencilIcon />
          {note ? 'Edit note' : 'Add a note'}
        </button>
      )}
    </>
  )
}
