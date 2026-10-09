import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MoreIcon, TrashIcon } from './icons'

// A "⋯" button on a card; removing lives behind it so it's not one stray tap away. Styled by default
// for a media card's cover shortcuts.
export function EntryMenu({
  onRemove,
  label = 'Remove',
  icon = <TrashIcon />,
  triggerClassName = 'cover-action',
  triggerLabel = 'More actions',
}: {
  onRemove: () => void
  label?: string
  icon?: ReactNode
  triggerClassName?: string
  triggerLabel?: string
}) {
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
        className={`btn-icon ${triggerClassName}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        title={triggerLabel}
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
            {icon}
            {label}
          </button>
        </div>
      )}
    </div>
  )
}
