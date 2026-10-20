import { describe, expect, it, vi } from 'vitest'

// series.ts imports the Prisma client and (through releases.ts) the providers, which need API
// keys at import; derivedSeriesStatus touches neither.
vi.mock('./prisma.js', () => ({ prisma: {} }))
vi.mock('../providers/index.js', () => ({ providersByType: {} }))

const { derivedSeriesStatus } = await import('./series.js')

describe('derivedSeriesStatus', () => {
  it('is done once every volume is done, whatever it was before', () => {
    expect(derivedSeriesStatus('want', { total: 3, done: 3, started: 0 })).toBe('done')
    expect(derivedSeriesStatus('in_progress', { total: 3, done: 3, started: 3 })).toBe('done')
    expect(derivedSeriesStatus('done', { total: 1, done: 1, started: 1 })).toBe('done')
  })

  it('moves a finished series back to in progress when a volume is no longer done', () => {
    expect(derivedSeriesStatus('done', { total: 3, done: 2, started: 2 })).toBe('in_progress')
    // Even when nothing is started any more: un-finishing a series doesn't send it back to want.
    expect(derivedSeriesStatus('done', { total: 3, done: 0, started: 0 })).toBe('in_progress')
  })

  it('moves a wanted series to in progress once any volume is started', () => {
    expect(derivedSeriesStatus('want', { total: 5, done: 0, started: 1 })).toBe('in_progress')
    expect(derivedSeriesStatus('want', { total: 5, done: 1, started: 1 })).toBe('in_progress')
  })

  it('leaves a wanted series alone while nothing is started', () => {
    expect(derivedSeriesStatus('want', { total: 5, done: 0, started: 0 })).toBe('want')
  })

  it('never moves an in-progress series back to want', () => {
    expect(derivedSeriesStatus('in_progress', { total: 5, done: 0, started: 0 })).toBe('in_progress')
    expect(derivedSeriesStatus('in_progress', { total: 5, done: 2, started: 3 })).toBe('in_progress')
  })

  it("doesn't count a series with no (released) volumes as done", () => {
    // Callers count only volumes that are out, so a series of only announced volumes has total 0.
    expect(derivedSeriesStatus('want', { total: 0, done: 0, started: 0 })).toBe('want')
    expect(derivedSeriesStatus('in_progress', { total: 0, done: 0, started: 0 })).toBe('in_progress')
    expect(derivedSeriesStatus('done', { total: 0, done: 0, started: 0 })).toBe('in_progress')
  })
})
