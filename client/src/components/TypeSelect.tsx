import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { FILTERABLE_MEDIA_TYPES, MEDIA_TYPE_LABELS } from '../lib/mediaTypes'
import type { MediaType } from '../types'
import { MediaTypeIcon } from './icons'

type TypeOption = MediaType | 'all'

// "All types" gets a four-square grid, one square per type.
function TypeIcon({ type }: { type: TypeOption }) {
  if (type !== 'all') return <MediaTypeIcon type={type} />
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

const optionLabel = (type: TypeOption) => (type === 'all' ? 'All types' : MEDIA_TYPE_LABELS[type])

// A styled stand-in for a <select> of media types, with each type's icon. Follows the listbox
// pattern: arrow keys move through the options, Enter/Space picks, Escape and clicking away close.
export function TypeSelect({ value, onChange }: { value: TypeOption; onChange: (type: TypeOption) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    listRef.current?.focus()
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  function openList() {
    setActive(FILTERABLE_MEDIA_TYPES.indexOf(value))
    setOpen(true)
  }

  function choose(type: TypeOption) {
    setOpen(false)
    triggerRef.current?.focus()
    if (type !== value) onChange(type)
  }

  function handleTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openList()
    }
  }

  function handleListKeyDown(event: KeyboardEvent) {
    const last = FILTERABLE_MEDIA_TYPES.length - 1
    switch (event.key) {
      case 'ArrowDown':
        setActive((index) => Math.min(index + 1, last))
        break
      case 'ArrowUp':
        setActive((index) => Math.max(index - 1, 0))
        break
      case 'Home':
        setActive(0)
        break
      case 'End':
        setActive(last)
        break
      case 'Enter':
      case ' ':
        choose(FILTERABLE_MEDIA_TYPES[active])
        break
      case 'Escape':
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        return
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <div className="type-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="type-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Type: ${optionLabel(value)}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
      >
        <TypeIcon type={value} />
        <span>{optionLabel(value)}</span>
        <svg className="type-select-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          className="type-select-panel"
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={handleListKeyDown}
        >
          {FILTERABLE_MEDIA_TYPES.map((type, index) => (
            <li
              key={type}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={type === value}
              className={`type-select-option${index === active ? ' is-active' : ''}`}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(type)}
            >
              <TypeIcon type={type} />
              <span>{optionLabel(type)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
