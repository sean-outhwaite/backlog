import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from './Spinner'

// Name and describe a list, new or existing. Picks keeps its name, so only its description is editable.
export function CollectionFormDialog({
  title,
  submitLabel,
  initial = { name: '', description: '' },
  nameEditable = true,
  onSubmit,
  onClose,
}: {
  title: string
  submitLabel: string
  initial?: { name: string; description: string }
  nameEditable?: boolean
  onSubmit: (values: { name: string; description: string }) => Promise<void>
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  useEffect(() => {
    // Guarded because StrictMode runs this twice, and showModal throws on an open dialog.
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = () => dialogRef.current?.close()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus('working')
    try {
      await onSubmit({ name: name.trim(), description: description.trim() })
      close()
    } catch {
      setStatus('error')
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby={headingId}
      onClose={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <form className="confirm collection-form" onSubmit={(event) => void handleSubmit(event)}>
        <h2 id={headingId}>{title}</h2>
        {nameEditable && (
          <label>
            Name
            <input
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Best horror"
              autoFocus
            />
          </label>
        )}
        <label>
          <span>
            Description <span className="optional">(optional)</span>
          </span>
          <textarea
            maxLength={280}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What's it for?"
          />
        </label>
        {status === 'error' && <p className="error-text">That didn't work. Try again?</p>}
        <footer className="confirm-footer">
          <button type="button" className="btn-quiet" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={status === 'working' || (nameEditable && !name.trim())}
          >
            {status === 'working' && <Spinner />}
            {submitLabel}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  )
}
