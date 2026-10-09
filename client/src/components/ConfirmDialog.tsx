import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from './Spinner'

// Asks before doing something that's hard to undo. Stays open, showing an error, if it fails.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  useEffect(() => {
    // Guarded because StrictMode runs this twice, and showModal throws on an open dialog.
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = () => dialogRef.current?.close()

  async function confirm() {
    setStatus('working')
    try {
      await onConfirm()
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
        // React bubbles close through the portal to its owner, which may be another dialog.
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <div className="confirm">
        <h2 id={headingId}>{title}</h2>
        <div className="confirm-body">{children}</div>
        {status === 'error' && <p className="error-text">That didn't work. Try again?</p>}
        <footer className="confirm-footer">
          {/* First in the dialog, so showModal focuses Cancel rather than the action. */}
          <button type="button" className="btn-quiet" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger-solid' : 'btn-primary'}
            onClick={() => void confirm()}
            disabled={status === 'working'}
            aria-busy={status === 'working'}
          >
            {status === 'working' && <Spinner />}
            {confirmLabel}
          </button>
        </footer>
      </div>
    </dialog>,
    document.body,
  )
}
