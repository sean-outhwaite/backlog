import { describe, expect, it } from 'vitest'
import { invalidDates, statusDates } from './entryDates.js'

const now = new Date('2026-11-03T10:00:00Z')
const earlier = new Date('2026-10-01T10:00:00Z')
const later = new Date('2026-10-20T10:00:00Z')

describe('statusDates', () => {
  it('stamps the start when a title is started', () => {
    expect(statusDates({ status: 'want', startedAt: null, completedAt: null }, 'in_progress', now)).toEqual({
      startedAt: now,
      completedAt: null,
    })
  })

  it('keeps the original start when a finished title is resumed', () => {
    expect(statusDates({ status: 'done', startedAt: earlier, completedAt: later }, 'in_progress', now)).toEqual({
      startedAt: earlier,
      completedAt: null,
    })
  })

  it('stamps the finish and leaves the start alone', () => {
    expect(statusDates({ status: 'in_progress', startedAt: earlier, completedAt: null }, 'done', now)).toEqual({
      startedAt: earlier,
      completedAt: now,
    })
    expect(statusDates({ status: 'want', startedAt: null, completedAt: null }, 'done', now)).toEqual({
      startedAt: null,
      completedAt: now,
    })
  })

  it('forgets both when moved back to the backlog', () => {
    expect(statusDates({ status: 'done', startedAt: earlier, completedAt: later }, 'want', now)).toEqual({
      startedAt: null,
      completedAt: null,
    })
  })

  it('changes nothing when the status stays the same', () => {
    expect(statusDates({ status: 'done', startedAt: earlier, completedAt: later }, 'done', now)).toEqual({
      startedAt: earlier,
      completedAt: later,
    })
  })
})

describe('invalidDates', () => {
  it('accepts dates that fit the status', () => {
    expect(invalidDates('done', { startedAt: earlier, completedAt: later }, now)).toBeNull()
    expect(invalidDates('in_progress', { startedAt: earlier, completedAt: null }, now)).toBeNull()
    expect(invalidDates('want', { startedAt: null, completedAt: null }, now)).toBeNull()
  })

  it("rejects dates the status doesn't have", () => {
    expect(invalidDates('want', { startedAt: earlier, completedAt: null }, now)).not.toBeNull()
    expect(invalidDates('in_progress', { startedAt: earlier, completedAt: later }, now)).not.toBeNull()
  })

  it('rejects a finish before the start, or a date in the future', () => {
    expect(invalidDates('done', { startedAt: later, completedAt: earlier }, now)).not.toBeNull()
    expect(invalidDates('done', { startedAt: earlier, completedAt: new Date('2027-01-01') }, now)).not.toBeNull()
  })
})
