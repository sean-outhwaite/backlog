import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { ListEntry } from '../types'
import { CalendarIcon, PencilIcon } from './icons'

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

// Date inputs speak local dates: "2026-11-03".
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

// Only the date is shown, but the server keeps a moment. An unchanged date keeps the moment it had;
// a changed one becomes the start of that day for a start, and the end of it (or now, if that's
// sooner) for a finish, so a start and finish on the same day stay in order.
function fromLocalInput(value: string, original: string | null, end: 'start' | 'finish') {
  if (!value) return null
  if (value === toLocalInput(original)) return original
  const [year, month, day] = value.split('-').map(Number)
  if (end === 'start') return new Date(year, month - 1, day).toISOString()
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
  return new Date(Math.min(endOfDay.getTime(), Date.now())).toISOString()
}

// When a started or finished entry was started and finished, in its details dialog, with an editor
// for putting them right (the app only knows when you pressed the button).
export function EntryDates({ entry, onSaved }: { entry: ListEntry; onSaved: (entry: ListEntry) => void }) {
  const [editing, setEditing] = useState(false)
  const [started, setStarted] = useState('')
  const [finished, setFinished] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (entry.status === 'want') return null
  const done = entry.status === 'done'

  function startEditing() {
    setStarted(toLocalInput(entry.startedAt))
    setFinished(toLocalInput(entry.completedAt))
    setError(null)
    setEditing(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await api.patch<ListEntry>(`/api/lists/${entry.id}`, {
        startedAt: fromLocalInput(started, entry.startedAt, 'start'),
        ...(done && { completedAt: fromLocalInput(finished, entry.completedAt, 'finish') }),
      })
      onSaved(updated)
      setEditing(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save those dates")
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    const now = toLocalInput(new Date().toISOString())
    return (
      <form className="entry-dates entry-dates--editing" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Started
          <input
            type="date"
            value={started}
            max={finished || now}
            onChange={(event) => setStarted(event.target.value)}
          />
        </label>
        {done && (
          <label>
            Finished
            <input
              type="date"
              value={finished}
              min={started || undefined}
              max={now}
              onChange={(event) => setFinished(event.target.value)}
            />
          </label>
        )}
        {error && <p className="error-text">{error}</p>}
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
    <div className="entry-dates">
      <CalendarIcon />
      <dl>
        <div>
          <dt>Started</dt>
          <dd>{entry.startedAt ? formatter.format(new Date(entry.startedAt)) : 'Not recorded'}</dd>
        </div>
        {done && (
          <div>
            <dt>Finished</dt>
            <dd>{entry.completedAt ? formatter.format(new Date(entry.completedAt)) : 'Not recorded'}</dd>
          </div>
        )}
      </dl>
      <button type="button" className="btn-quiet note-editor-trigger" onClick={startEditing}>
        <PencilIcon />
        Edit dates
      </button>
    </div>
  )
}
