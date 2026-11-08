import { api } from './api'

// Web Push on this device: the service worker (public/sw.js) shows the notifications, and the
// server (server/src/lib/push.ts) sends one for every in-app notification to each saved
// subscription.

export type PushState =
  | 'unsupported' // this browser can't do push at all
  | 'install' // iOS/iPadOS Safari: push only works once the app is added to the Home Screen
  | 'denied' // blocked in browser or system settings; only the user can undo that
  | 'off'
  | 'on'

// When this device last told the server its subscription, and which one. See resyncPush.
const SYNCED_KEY = 'push-synced'
const RESYNC_MS = 24 * 60 * 60 * 1000

function isIos(): boolean {
  // iPadOS reports itself as a Mac, but no Mac has a touchscreen.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch((error: unknown) => console.warn('Service worker failed:', error))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js')
}

async function currentSubscription(): Promise<PushSubscription | null> {
  return (await registration()).pushManager.getSubscription()
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey
  if (!current) return false
  const bytes = new Uint8Array(current)
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index])
}

async function saveSubscription(subscription: PushSubscription) {
  await api.post('/api/push/subscriptions', subscription.toJSON())
  try {
    localStorage.setItem(SYNCED_KEY, JSON.stringify({ endpoint: subscription.endpoint, at: Date.now() }))
  } catch {
    // Storage unavailable: it just resyncs on the next load.
  }
}

// Must be called straight from a tap: browsers (iOS especially) only show the permission prompt
// in response to one, so nothing is awaited before asking.
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/key')
  const key = base64UrlToBytes(publicKey)
  const reg = await registration()
  let subscription = await reg.pushManager.getSubscription()
  // Subscribed under different keys (they were changed): subscribe() would throw until it's dropped.
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await saveSubscription(subscription)
  return 'on'
}

// Turns push off for this device: the server forgets it, then the browser does. The browser half
// happens even if the server can't be reached (the server drops it later, when the push service
// starts answering 410).
export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return getPushState()
  const subscription = await currentSubscription()
  if (subscription) {
    try {
      await api.delete('/api/push/subscriptions', { endpoint: subscription.endpoint })
    } finally {
      await subscription.unsubscribe()
      try {
        localStorage.removeItem(SYNCED_KEY)
      } catch {
        // Nothing to clean up.
      }
    }
  }
  return 'off'
}

// On app load: re-sends this device's subscription when it's new to the server or hasn't been
// sent for a day. Browsers rotate subscriptions, and the server deletes ones that bounce, so
// without this the toggle could say "on" while nothing arrives.
export async function resyncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return
  const subscription = await currentSubscription()
  if (!subscription) return
  try {
    const synced = JSON.parse(localStorage.getItem(SYNCED_KEY) ?? 'null') as { endpoint: string; at: number } | null
    if (synced?.endpoint === subscription.endpoint && Date.now() - synced.at < RESYNC_MS) return
  } catch {
    // Unreadable: resync.
  }
  await saveSubscription(subscription)
}
