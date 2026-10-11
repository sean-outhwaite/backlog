import { useEffect, useRef, type CSSProperties } from 'react'

// A bar along the foot of the screen, with an optional action such as Undo; its underline runs
// down over `duration`. The caller owns the timer, this only shows it. Shown as a popover so it
// sits in the top layer, above any open modal dialog.
export function Toast({
  message,
  duration,
  action,
}: {
  message: string
  duration: number
  action?: { label: string; onClick: () => void }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const style = { '--toast-duration': `${duration}ms` } as CSSProperties

  useEffect(() => {
    const toast = ref.current
    if (toast && !toast.matches(':popover-open')) toast.showPopover()
  }, [])

  return (
    <div ref={ref} popover="manual" className={`toast${action ? ' has-action' : ''}`} role="status" style={style}>
      <span className="toast-message">{message}</span>
      {action && (
        <button className="toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
