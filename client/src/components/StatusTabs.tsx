import { useLayoutEffect, useRef, useState } from 'react'
import { STATUS_TABS } from '../hooks/useStatusParam'
import type { ListStatus } from '../types'

// The accent underline is one element that slides to whichever tab is active, measured from the
// DOM since the tabs are content-width. It re-measures on resize too, as counts arrive and the
// active tab's bolder label change widths.
export function StatusTabs({
  status,
  onChange,
  countFor,
}: {
  status: ListStatus
  onChange: (status: ListStatus) => void
  countFor: (status: ListStatus) => number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Partial<Record<ListStatus, HTMLButtonElement | null>>>({})
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const tab = tabRefs.current[status]
      if (tab) setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [status])

  return (
    <div className="status-tabs" ref={containerRef}>
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.status}
          ref={(el) => {
            tabRefs.current[tab.status] = el
          }}
          className={status === tab.status ? 'active' : ''}
          aria-pressed={status === tab.status}
          onClick={() => onChange(tab.status)}
        >
          {tab.label}
          <span className="status-count">{countFor(tab.status)}</span>
        </button>
      ))}
      {indicator && (
        <span
          className="status-indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
        />
      )}
    </div>
  )
}
