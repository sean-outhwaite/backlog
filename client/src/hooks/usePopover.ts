import { useEffect, type RefObject } from 'react'

// Closes an open dropdown on a click outside it, or on Escape (handing focus back to its trigger).
export function usePopover(
  open: boolean,
  setOpen: (open: boolean) => void,
  rootRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
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
  }, [open, setOpen, rootRef, triggerRef])
}
