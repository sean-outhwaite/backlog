import { beforeEach, describe, expect, it, vi } from 'vitest'

// push.ts reads env (which requires API keys at import), queries Prisma and calls web-push: all
// mocked, so nothing here touches the database or the network.
const env = vi.hoisted(() => ({
  vapid: { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:test@example.test' } as object | null,
}))
const prisma = vi.hoisted(() => ({
  pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
  notification: { groupBy: vi.fn() },
}))
const sendNotification = vi.hoisted(() => vi.fn())

vi.mock('./env.js', () => ({ env }))
vi.mock('./prisma.js', () => ({ prisma }))
vi.mock('web-push', () => ({ sendNotification }))

const { isGoneError, isPushServiceUrl, recommendationPush, releasePush, sendPush } = await import('./push.js')

function subscription(userId: string, endpoint: string) {
  return { id: endpoint, userId, endpoint, p256dh: 'p', auth: 'a', createdAt: new Date() }
}

const payload = releasePush({ id: 'm1', title: 'Dune' })

beforeEach(() => {
  vi.clearAllMocks()
  env.vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:test@example.test' }
  prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 })
  prisma.notification.groupBy.mockResolvedValue([])
  sendNotification.mockResolvedValue({ statusCode: 201 })
})

describe('isPushServiceUrl', () => {
  it('accepts the browsers’ push services', () => {
    expect(isPushServiceUrl('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isPushServiceUrl('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isPushServiceUrl('https://web.push.apple.com/abc')).toBe(true)
    expect(isPushServiceUrl('https://wns2-sy3p.notify.windows.com/w/?token=abc')).toBe(true)
  })

  it('rejects anything else, so the server can’t be pointed at an arbitrary URL', () => {
    expect(isPushServiceUrl('https://example.com/push')).toBe(false)
    expect(isPushServiceUrl('https://fcm.googleapis.com.evil.example/x')).toBe(false)
    expect(isPushServiceUrl('https://evilpush.apple.com/x')).toBe(false)
    expect(isPushServiceUrl('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(isPushServiceUrl('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(isPushServiceUrl('not a url')).toBe(false)
  })
})

describe('isGoneError', () => {
  it('is true only for 404 and 410', () => {
    expect(isGoneError({ statusCode: 404 })).toBe(true)
    expect(isGoneError({ statusCode: 410 })).toBe(true)
    expect(isGoneError({ statusCode: 429 })).toBe(false)
    expect(isGoneError(new Error('socket hang up'))).toBe(false)
    expect(isGoneError(null)).toBe(false)
  })
})

describe('payloads', () => {
  it('names the friend and title, and uses their message when there is one', () => {
    const actor = { id: 'u1', username: 'alex' }
    const item = { id: 'm1', title: 'Dune' }
    expect(recommendationPush(actor, item, ' Read it! ')).toEqual({
      title: 'alex recommended Dune',
      body: 'Read it!',
      url: '/recommendations',
      tag: 'recommendation-u1-m1',
    })
    expect(recommendationPush({ id: 'u1', username: null }, item).title).toBe('A friend recommended Dune')
    expect(recommendationPush(actor, item, '   ').body).toBe('Tap to see it in your recommendations.')
  })

  it('tags releases by title so a repeat replaces rather than stacks', () => {
    expect(payload).toMatchObject({ title: 'Dune is out now', url: '/', tag: 'released-m1' })
  })
})

describe('sendPush', () => {
  it('does nothing when push isn’t configured', async () => {
    env.vapid = null
    await sendPush([{ userIds: ['u1'], payload }])
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled()
  })

  it('does nothing when there’s no one to send to', async () => {
    await sendPush([{ userIds: [], payload }])
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled()
  })

  it('sends each message to every device of its own users only', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      subscription('u1', 'https://fcm.googleapis.com/1'),
      subscription('u1', 'https://web.push.apple.com/2'),
      subscription('u2', 'https://fcm.googleapis.com/3'),
    ])
    const other = releasePush({ id: 'm2', title: 'Halo' })

    const summary = await sendPush([
      { userIds: ['u1'], payload },
      { userIds: ['u2', 'u3'], payload: other },
    ])

    expect(summary).toEqual({ sent: 3, failed: 0, removed: 0 })
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { userId: { in: ['u1', 'u2', 'u3'] } } })
    const sent = sendNotification.mock.calls.map(([sub, body]) => [sub.endpoint, JSON.parse(body).tag])
    expect(sent).toEqual([
      ['https://fcm.googleapis.com/1', 'released-m1'],
      ['https://web.push.apple.com/2', 'released-m1'],
      ['https://fcm.googleapis.com/3', 'released-m2'],
    ])
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ vapidDetails: env.vapid })
  })

  it('adds each recipient’s unread count as the badge', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      subscription('u1', 'https://fcm.googleapis.com/1'),
      subscription('u2', 'https://fcm.googleapis.com/2'),
    ])
    prisma.notification.groupBy.mockResolvedValue([{ userId: 'u1', _count: 3 }])

    await sendPush([{ userIds: ['u1', 'u2'], payload }])

    expect(prisma.notification.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: { userId: { in: ['u1', 'u2'] }, readAt: null },
      _count: true,
    })
    const badges = sendNotification.mock.calls.map(([, body]) => JSON.parse(body).badge)
    expect(badges).toEqual([3, 0])
  })

  it('still sends, without a badge, when counting fails', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([subscription('u1', 'https://fcm.googleapis.com/1')])
    prisma.notification.groupBy.mockRejectedValue(new Error('timeout'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const summary = await sendPush([{ userIds: ['u1'], payload }])

    expect(summary.sent).toBe(1)
    expect(JSON.parse(sendNotification.mock.calls[0][1])).not.toHaveProperty('badge')
  })

  it('deletes subscriptions the push service says are gone, and keeps the rest', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      subscription('u1', 'https://fcm.googleapis.com/gone'),
      subscription('u1', 'https://fcm.googleapis.com/busy'),
      subscription('u1', 'https://fcm.googleapis.com/ok'),
    ])
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 })
    sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValueOnce({ statusCode: 201 })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const summary = await sendPush([{ userIds: ['u1'], payload }])

    expect(summary).toEqual({ sent: 1, failed: 2, removed: 1 })
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ['https://fcm.googleapis.com/gone'] } },
    })
  })

  it('never throws, even when the database fails', async () => {
    prisma.pushSubscription.findMany.mockRejectedValue(new Error('connection lost'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(sendPush([{ userIds: ['u1'], payload }])).resolves.toEqual({ sent: 0, failed: 0, removed: 0 })
  })

  it('gives up at the deadline instead of waiting on a slow push service', async () => {
    vi.useFakeTimers()
    try {
      prisma.pushSubscription.findMany.mockResolvedValue([subscription('u1', 'https://fcm.googleapis.com/1')])
      sendNotification.mockReturnValue(new Promise(() => {}))
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = sendPush([{ userIds: ['u1'], payload }], 1_000)
      await vi.advanceTimersByTimeAsync(1_000)

      await expect(result).resolves.toEqual({ sent: 0, failed: 0, removed: 0 })
    } finally {
      vi.useRealTimers()
    }
  })
})
