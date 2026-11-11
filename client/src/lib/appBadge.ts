// The unread count on the installed app's icon (the Badging API): installed apps on iOS 16.4+
// (only once notifications are allowed), macOS Safari web apps, and desktop Chrome/Edge. Android
// and Firefox don't support it. While the app is closed, the service worker (public/sw.js) sets it
// from each push instead, with the count the server sends along.
export function setAppBadge(count: number): void {
  if (!('setAppBadge' in navigator)) return
  const done = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()
  // Rejects without notification permission: nothing to do about that here.
  done.catch(() => {})
}
