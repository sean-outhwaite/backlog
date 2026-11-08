import { afterEach, describe, expect, it, vi } from 'vitest'
import { providerFetch } from './types.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const url = 'https://api.themoviedb.org/3/movie/603?api_key=secret'

describe('providerFetch', () => {
  it('names the provider and endpoint when a call times out, without the query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }),
    )

    const failure = providerFetch('TMDB', url)
    await expect(failure).rejects.toThrow('TMDB GET /3/movie/603 timed out after 5000ms')
    await expect(failure).rejects.not.toThrow('secret')
  })

  it("says when it couldn't connect", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )

    await expect(providerFetch('TMDB', url)).rejects.toThrow('TMDB GET /3/movie/603 failed to connect')
  })

  it('throws on an error status, with the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 522 })),
    )

    await expect(providerFetch('TMDB', url)).rejects.toThrow('TMDB GET /3/movie/603 failed: 522')
  })

  it('returns a 404 only when told it means not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )

    expect((await providerFetch('TMDB', url, { allowNotFound: true })).status).toBe(404)
    await expect(providerFetch('TMDB', url)).rejects.toThrow('failed: 404')
  })
})
