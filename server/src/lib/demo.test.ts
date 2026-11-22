import { afterEach, describe, expect, it, vi } from 'vitest'

const env: { demoSeedSecret?: string } = {}
vi.mock('./env.js', () => ({ env }))

const { demoVerdict, isDemoSeedRequest, isDemoToken } = await import('./demo.js')

describe('isDemoToken', () => {
  it('needs app_metadata.demo to be exactly true', () => {
    expect(isDemoToken({ app_metadata: { demo: true } })).toBe(true)
    expect(isDemoToken({ app_metadata: { demo: 'true' } })).toBe(false)
    expect(isDemoToken({ app_metadata: { demo: false } })).toBe(false)
    expect(isDemoToken({ app_metadata: null })).toBe(false)
    expect(isDemoToken({ user_metadata: { demo: true } })).toBe(false)
    expect(isDemoToken({})).toBe(false)
  })
})

describe('demoVerdict', () => {
  it('allows reads', () => {
    expect(demoVerdict('GET', '/api/lists')).toBe('allow')
    expect(demoVerdict('GET', '/api/media/search')).toBe('allow')
    expect(demoVerdict('HEAD', '/api/friends')).toBe('allow')
  })

  it('refuses writes', () => {
    expect(demoVerdict('POST', '/api/lists')).toBe('refuse')
    expect(demoVerdict('PATCH', '/api/profile/me')).toBe('refuse')
    expect(demoVerdict('PUT', '/api/profile/me/avatar')).toBe('refuse')
    expect(demoVerdict('DELETE', '/api/friends/abc')).toBe('refuse')
    expect(demoVerdict('POST', '/api/recommendations')).toBe('refuse')
    expect(demoVerdict('POST', '/api/invites/abc/redeem')).toBe('refuse')
    expect(demoVerdict('POST', '/api/push/subscriptions')).toBe('refuse')
  })

  it("refuses the demo's own invite link, which a GET would create", () => {
    expect(demoVerdict('GET', '/api/invites/mine')).toBe('refuse')
  })

  // Express routes these to the same handlers, so they must get the same verdict.
  it('ignores case and trailing slashes, as Express routing does', () => {
    expect(demoVerdict('GET', '/api/invites/MINE')).toBe('refuse')
    expect(demoVerdict('GET', '/api/INVITES/mine')).toBe('refuse')
    expect(demoVerdict('GET', '/api/invites/mine/')).toBe('refuse')
    expect(demoVerdict('GET', '/api/invites/mine//')).toBe('refuse')
    expect(demoVerdict('POST', '/api/Notifications/read/')).toBe('no-op')
    expect(demoVerdict('POST', '/api/LISTS')).toBe('refuse')
  })

  it('quietly skips the writes the app makes on its own', () => {
    expect(demoVerdict('POST', '/api/notifications/read')).toBe('no-op')
    expect(demoVerdict('DELETE', '/api/push/subscriptions')).toBe('no-op')
  })
})

describe('isDemoSeedRequest', () => {
  afterEach(() => {
    delete env.demoSeedSecret
    vi.unstubAllEnvs()
  })

  it('needs the secret to be set and to match exactly', () => {
    expect(isDemoSeedRequest('anything')).toBe(false)
    env.demoSeedSecret = 'a-long-random-secret'
    expect(isDemoSeedRequest(undefined)).toBe(false)
    expect(isDemoSeedRequest('')).toBe(false)
    expect(isDemoSeedRequest('a-long-random-secre')).toBe(false)
    expect(isDemoSeedRequest('A-LONG-RANDOM-SECRET')).toBe(false)
    expect(isDemoSeedRequest('a-long-random-secret')).toBe(true)
  })

  it('is never honoured on Vercel', () => {
    env.demoSeedSecret = 'a-long-random-secret'
    vi.stubEnv('VERCEL', '1')
    expect(isDemoSeedRequest('a-long-random-secret')).toBe(false)
  })
})
