import { sendNotification } from 'web-push'
import { env } from './env.js'
import { prisma } from './prisma.js'

// Web Push: every Notification row also goes to the recipient's devices that turned push on
// (PushSubscription). The client's service worker (client/public/sw.js) shows the payload.

export interface PushPayload {
  title: string
  body: string
  // Opened when the notification is tapped.
  url: string
  // A newer notification with the same tag replaces the older one on the device.
  tag: string
}

export interface PushMessage {
  userIds: string[]
  payload: PushPayload
}

export function recommendationPush(
  actor: { id: string; username: string | null },
  mediaItem: { id: string; title: string },
  message?: string,
): PushPayload {
  return {
    title: `${actor.username ?? 'A friend'} recommended ${mediaItem.title}`,
    body: message?.trim() || 'Tap to see it in your recommendations.',
    url: '/recommendations',
    tag: `recommendation-${actor.id}-${mediaItem.id}`,
  }
}

export function releasePush(mediaItem: { id: string; title: string }): PushPayload {
  return {
    title: `${mediaItem.title} is out now`,
    body: 'Tap to see it in your backlog.',
    url: '/',
    tag: `released-${mediaItem.id}`,
  }
}

// The server POSTs to whatever endpoint a browser hands it, so only accept the real push services
// rather than letting any signed-in user point our server at an arbitrary URL.
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, most Chromium browsers
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari (web.push.apple.com)
  'notify.windows.com', // Edge on Windows (wns2-*.notify.windows.com)
]

export function isPushServiceUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '') return false
  return PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
}

// Push services answer 404/410 once a subscription has expired or been revoked: delete those.
export function isGoneError(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return status === 404 || status === 410
}

const SEND_TIMEOUT_MS = 5_000
// Worth keeping for a day: a phone that's off for longer gets the in-app notification instead.
const TTL_SECONDS = 24 * 60 * 60

export interface PushSummary {
  sent: number
  failed: number
  removed: number
}

// Sends each message to every device of each of its users, and deletes subscriptions the push
// service says are gone. Never throws, and gives up after `deadlineMs`, so a slow push service
// can't fail or stall whatever caused the notification.
export async function sendPush(messages: PushMessage[], deadlineMs = 10_000): Promise<PushSummary> {
  const summary: PushSummary = { sent: 0, failed: 0, removed: 0 }
  const vapid = env.vapid
  if (!vapid || messages.every((message) => message.userIds.length === 0)) return summary

  const work = (async () => {
    const userIds = [...new Set(messages.flatMap((message) => message.userIds))]
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } })
    const deliveries = messages.flatMap((message) =>
      subscriptions
        .filter((subscription) => message.userIds.includes(subscription.userId))
        .map((subscription) => ({ subscription, payload: message.payload })),
    )

    const results = await Promise.allSettled(
      deliveries.map(({ subscription, payload }) =>
        sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(payload),
          { vapidDetails: vapid, TTL: TTL_SECONDS, timeout: SEND_TIMEOUT_MS },
        ),
      ),
    )

    const gone = new Set<string>()
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        summary.sent++
        return
      }
      summary.failed++
      const { endpoint } = deliveries[index].subscription
      if (isGoneError(result.reason)) gone.add(endpoint)
      else console.warn(`Push to ${new URL(endpoint).hostname} failed:`, result.reason)
    })

    if (gone.size > 0) {
      const { count } = await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: [...gone] } } })
      summary.removed = count
    }
    // Caught here rather than around the race, so a failure after the deadline isn't an
    // unhandled rejection (which would take the whole process down).
  })().catch((error: unknown) => console.warn('Push sending failed:', error))

  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`Push sending passed its ${deadlineMs}ms deadline; giving up on the rest`)
      resolve()
    }, deadlineMs)
  })
  await Promise.race([work, deadline])
  clearTimeout(timer)
  return summary
}
