import { afterEach, describe, expect, it, vi } from 'vitest'
import { providerFetch } from './types.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const url = 'https://api.rawg.io/api/games/53743?key=secret'

describe('providerFetch', () => {
  it('names the provider and endpoint when a call times out, without the query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }),
    )

    const failure = providerFetch('RAWG', url)
    await expect(failure).rejects.toThrow('RAWG GET /api/games/53743 timed out after 5000ms')
    await expect(failure).rejects.not.toThrow('secret')
  })

  it("says when it couldn't connect", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )

    await expect(providerFetch('RAWG', url)).rejects.toThrow('RAWG GET /api/games/53743 failed to connect')
  })

  it('throws on an error status, with the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 522 })),
    )

    await expect(providerFetch('RAWG', url)).rejects.toThrow('RAWG GET /api/games/53743 failed: 522')
  })

  it('returns a 404 only when told it means not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )

    expect((await providerFetch('RAWG', url, { allowNotFound: true })).status).toBe(404)
    await expect(providerFetch('RAWG', url)).rejects.toThrow('failed: 404')
  })
})
