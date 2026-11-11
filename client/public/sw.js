// Backlog's service worker: push notifications only. There's deliberately no fetch handler and no
// caching, so it can never serve a stale build or a cached API response. Plain JS, served as-is
// from /sw.js (not bundled), so it can control the whole origin.
//
// Payloads come from server/src/lib/push.ts: { title, body, url, tag, badge? }, where badge is the
// recipient's unread count for the app icon (left alone when the server couldn't count).

self.addEventListener('install', () => {
  self.skipWaiting()
})

// Take over pages that were already open, so notification clicks can find them.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function windows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
}

// The unread count on the app icon, where the browser supports it (installed apps on iOS 16.4+,
// macOS Safari, desktop Chrome/Edge). Open copies of the app also set it, from their own polls.
async function setBadge(count) {
  if (typeof count !== 'number' || !('setAppBadge' in self.navigator)) return
  try {
    if (count > 0) await self.navigator.setAppBadge(count)
    else await self.navigator.clearAppBadge()
  } catch {
    // Not allowed (no notification permission) or not supported: the notification still shows.
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Not JSON: still show something, since every push must show a notification (iOS revokes
    // the subscription of a site that receives pushes without showing one).
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || 'Backlog', {
        body: data.body,
        tag: data.tag,
        icon: '/icon-192.png',
        data: { url: data.url || '/' },
      })
      await setBadge(data.badge)
      // Open copies of the app refresh their unread counts now rather than at the next poll.
      for (const client of await windows()) client.postMessage({ type: 'push' })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const open = (await windows()).find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        // The app routes there itself (see NotificationsProvider), without a full reload.
        await open.focus()
        open.postMessage({ type: 'navigate', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
