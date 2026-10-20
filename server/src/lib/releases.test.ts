import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// releases.ts imports the Prisma client and the providers (which need API keys at import) for
// checkReleases; the helpers tested here touch neither.
vi.mock('./prisma.js', () => ({ prisma: {} }))
vi.mock('../providers/index.js', () => ({ providersByType: {} }))

const { isOut, isOutWhere, releaseColumns } = await import('./releases.js')

const NOW = new Date('2026-10-20T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('releaseColumns', () => {
  it('stores an exact date as UTC midnight', () => {
    expect(releaseColumns({ releaseDate: '2027-03-05', unreleased: true }).releaseDate).toEqual(
      new Date('2027-03-05T00:00:00Z'),
    )
  })

  it('stores no date when the provider gives none', () => {
    expect(releaseColumns({ releaseDate: null, unreleased: true }).releaseDate).toBeNull()
    expect(releaseColumns({ releaseDate: null, unreleased: false }).releaseDate).toBeNull()
  })

  it('marks an upcoming title pending and checked now, so its release can be announced', () => {
    expect(releaseColumns({ releaseDate: '2027-03-05', unreleased: true })).toEqual({
      releaseDate: new Date('2027-03-05T00:00:00Z'),
      releasePending: true,
      releaseCheckedAt: NOW,
    })
  })

  it('leaves a title that is already out unchecked, so it is never announced', () => {
    expect(releaseColumns({ releaseDate: '1999-03-31', unreleased: false })).toEqual({
      releaseDate: new Date('1999-03-31T00:00:00Z'),
      releasePending: false,
      releaseCheckedAt: null,
    })
  })
})

describe('isOut', () => {
  const checked = new Date('2026-10-01T00:00:00Z')

  it('counts a title that is not pending as out', () => {
    expect(isOut({ releasePending: false, releaseDate: null, releaseCheckedAt: null })).toBe(true)
    expect(isOut({ releasePending: false, releaseDate: new Date('2030-01-01'), releaseCheckedAt: checked })).toBe(true)
  })

  it('counts a pending title never seen upcoming (null releaseCheckedAt) as out', () => {
    // Backfilled rows: stored before release tracking and not yet checked.
    expect(isOut({ releasePending: true, releaseDate: new Date('2030-01-01'), releaseCheckedAt: null })).toBe(true)
    expect(isOut({ releasePending: true, releaseDate: null, releaseCheckedAt: null })).toBe(true)
  })

  it('counts a checked pending title with a future date as not out', () => {
    expect(
      isOut({ releasePending: true, releaseDate: new Date('2026-10-21T00:00:00Z'), releaseCheckedAt: checked }),
    ).toBe(false)
  })

  it('counts a checked pending title with no date (TBA) as not out', () => {
    expect(isOut({ releasePending: true, releaseDate: null, releaseCheckedAt: checked })).toBe(false)
  })

  it("counts a pending title as out once its date arrives, before it's re-checked", () => {
    expect(
      isOut({ releasePending: true, releaseDate: new Date('2026-10-20T00:00:00Z'), releaseCheckedAt: checked }),
    ).toBe(true)
    expect(isOut({ releasePending: true, releaseDate: NOW, releaseCheckedAt: checked })).toBe(true)
    expect(isOut({ releasePending: true, releaseDate: new Date(NOW.getTime() + 1), releaseCheckedAt: checked })).toBe(
      false,
    )
  })

  it('agrees with releaseColumns for a freshly stored title', () => {
    expect(isOut(releaseColumns({ releaseDate: '2027-01-01', unreleased: true }))).toBe(false)
    expect(isOut(releaseColumns({ releaseDate: null, unreleased: true }))).toBe(false)
    expect(isOut(releaseColumns({ releaseDate: '2020-01-01', unreleased: false }))).toBe(true)
  })
})

describe('isOutWhere', () => {
  it('matches the same three ways out as isOut, dated now', () => {
    expect(isOutWhere()).toEqual({
      OR: [{ releasePending: false }, { releaseCheckedAt: null }, { releaseDate: { lte: NOW } }],
    })
  })
})
