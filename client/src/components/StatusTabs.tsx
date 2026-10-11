import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { STATUS_TABS, type ListTab } from '../hooks/useStatusParam'
import { CalendarIcon } from './icons'

// The accent underline is one element that slides to whichever tab is active, measured from the
// DOM since the tabs are content-width. It re-measures on resize too, as counts arrive and the
// active tab's bolder label change widths. Preorders only shows when something's waiting there, and
// sits apart from the statuses behind a divider, since it isn't a step after Done.
export function StatusTabs({
  status,
  onChange,
  countFor,
}: {
  status: ListTab
  onChange: (status: ListTab) => void
  countFor: (status: ListTab) => number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Partial<Record<ListTab, HTMLButtonElement | null>>>({})
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

  const tabs = STATUS_TABS.filter(
    (tab) => tab.status !== 'upcoming' || status === 'upcoming' || countFor('upcoming') > 0,
  )

  return (
    <div className="status-tabs" ref={containerRef}>
      {tabs.map((tab) => (
        <Fragment key={tab.status}>
          {tab.status === 'upcoming' && <span className="status-tabs-divider" aria-hidden="true" />}
          <button
            ref={(el) => {
              tabRefs.current[tab.status] = el
            }}
            className={`status-tab--${tab.status}${status === tab.status ? ' active' : ''}`}
            aria-pressed={status === tab.status}
            onClick={() => onChange(tab.status)}
          >
            {tab.status === 'upcoming' && <CalendarIcon />}
            <span className={`status-label status-label--${tab.status}`}>{tab.label}</span>
            <span className="status-count">{countFor(tab.status)}</span>
          </button>
        </Fragment>
      ))}
      {indicator && (
        <span
          className={`status-indicator${status === 'upcoming' ? ' status-indicator--upcoming' : ''}`}
          aria-hidden="true"
          style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
        />
      )}
    </div>
  )
}
