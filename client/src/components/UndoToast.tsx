import type { CSSProperties } from 'react'

// A bar along the foot of the screen with an Undo button; its underline runs down over `duration`.
// The caller owns the timer, this only shows it.
export function UndoToast({ message, duration, onUndo }: { message: string; duration: number; onUndo: () => void }) {
  const style = { '--toast-duration': `${duration}ms` } as CSSProperties
  return (
    <div className="undo-toast" role="status" style={style}>
      <span className="undo-toast-message">{message}</span>
      <button className="undo-toast-action" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
