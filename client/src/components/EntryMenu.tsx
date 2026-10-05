import { useEffect, useId, useRef, useState } from 'react'
import { MoreIcon, TrashIcon } from './icons'

// A "⋯" button among a card's cover shortcuts; removing lives behind it so it's not one stray tap away.
export function EntryMenu({ onRemove }: { onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="entry-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className="btn-icon cover-action"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <MoreIcon />
      </button>

      {open && (
        <div className="entry-menu-panel" id={panelId}>
          <button
            className="entry-menu-item btn-quiet btn-danger"
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
            autoFocus
          >
            <TrashIcon />
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
