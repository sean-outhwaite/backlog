import { useEffect, useState } from 'react'
import { BellIcon } from '../components/icons'
import { NotificationItem } from '../components/NotificationItem'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState, Spinner } from '../components/Spinner'
import { useNotifications } from '../hooks/useNotifications'
import { api } from '../lib/api'
import type { AppNotification, NotificationPage } from '../types'

const PAGE_SIZE = 20

// Every notification, newest first, a page at a time. Opening it marks everything read; the ones
// that were unread stay highlighted while you're here.
export function Notifications() {
  const { markRead } = useNotifications()
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api
      .get<NotificationPage>(`/api/notifications?limit=${PAGE_SIZE}`)
      .then((page) => {
        setNotifications(page.notifications)
        setNextCursor(page.nextCursor)
        if (page.notifications.some((notification) => !notification.readAt)) void markRead()
      })
      .catch(() => setFailed(true))
  }, [markRead])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const page = await api.get<NotificationPage>(`/api/notifications?limit=${PAGE_SIZE}&cursor=${nextCursor}`)
      setNotifications((prev) => [...(prev ?? []), ...page.notifications])
      setNextCursor(page.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Recommendations from friends, and preorder release updates." />

      {failed && (
        <EmptyState>
          <p>Couldn't load notifications.</p>
        </EmptyState>
      )}
      {!notifications && !failed && <LoadingState />}
      {notifications?.length === 0 && (
        <EmptyState icon={<BellIcon />}>
          <p>
            Nothing yet. You'll be notified here when a friend recommends something, or a title you're waiting on comes
            out.
          </p>
        </EmptyState>
      )}
      {!!notifications?.length && (
        <ul className="notifications-list notifications-feed">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <NotificationItem notification={notification} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <div className="notifications-more">
          <button onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? <Spinner /> : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
