import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { usePopover } from '../hooks/usePopover'
import { api } from '../lib/api'
import type { NotificationPage } from '../types'
import { BellIcon } from './icons'
import { NotificationItem } from './NotificationItem'
import { Spinner } from './Spinner'

// How many new notifications the menu has room for; the rest are on the notifications page.
const MENU_LIMIT = 5

// Bell in the sidebar (the top bar on phones). Opening it shows the newest few unread notifications
// and marks just those read, so any it hadn't room for keep the badge up until they're seen on the
// notifications page. Read ones only appear there.
export function NotificationsMenu() {
  const { unread, markSeen } = useNotifications()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<NotificationPage | null>(null)
  const [failed, setFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  usePopover(open, setOpen, rootRef, triggerRef)

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setFailed(false)
    // Otherwise the last open's list flashes up, with since-read items still showing as new.
    setPage(null)
    api
      .get<NotificationPage>(`/api/notifications?unread=true&limit=${MENU_LIMIT}`)
      .then((found) => {
        setPage(found)
        void markSeen(found.notifications)
      })
      .catch(() => setFailed(true))
  }

  const label = unread.total > 0 ? `Notifications, ${unread.total} unread` : 'Notifications'
  // Once the shown ones are marked read, whatever's still unread is what didn't fit.
  const more = page?.nextCursor ? unread.total : 0

  return (
    <div className="notifications-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className="notifications-trigger btn-quiet"
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label={label}
        title="Notifications"
        onClick={toggle}
      >
        <BellIcon />
        {unread.total > 0 && <span className="notifications-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="notifications-panel" id="notifications-panel">
          <h2 className="notifications-heading">Notifications</h2>
          {failed && <p className="notifications-empty">Couldn't load notifications.</p>}
          {!failed && page === null && (
            <p className="notifications-empty">
              <Spinner />
            </p>
          )}
          {page?.notifications.length === 0 && <p className="notifications-empty">No new notifications.</p>}
          {!!page?.notifications.length && (
            <ul className="notifications-list">
              {page.notifications.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onFollow={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
          {page && (
            <Link to="/notifications" className="notifications-all" onClick={() => setOpen(false)}>
              {more > 0 ? `See all · ${more} more new` : 'See all notifications'}
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
