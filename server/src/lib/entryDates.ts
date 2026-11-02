import type { ListStatus } from '@prisma/client'

export interface EntryDates {
  startedAt: Date | null
  completedAt: Date | null
}

// The dates a list entry moving from one status to another should have. Starting keeps an earlier
// start (resuming something finished, or undoing a finish), finishing leaves the start as it was
// (unknown, if it was never marked started), and going back to the backlog forgets both.
export function statusDates(
  from: { status: ListStatus } & EntryDates,
  to: ListStatus,
  now = new Date(),
): EntryDates {
  if (to === from.status) return { startedAt: from.startedAt, completedAt: from.completedAt }
  if (to === 'want') return { startedAt: null, completedAt: null }
  if (to === 'in_progress') return { startedAt: from.startedAt ?? now, completedAt: null }
  return { startedAt: from.startedAt, completedAt: now }
}

// Why dates the user set can't stand for an entry with this status, or null if they can: only
// started or finished titles have a start, only finished ones a finish, and neither is in the
// future or out of order.
export function invalidDates(status: ListStatus, dates: EntryDates, now = new Date()): string | null {
  const { startedAt, completedAt } = dates
  if (status === 'want' && startedAt) return "A title that hasn't been started can't have a start date"
  if (status !== 'done' && completedAt) return "A title that isn't finished can't have a finish date"
  if ((startedAt && startedAt > now) || (completedAt && completedAt > now)) return "Dates can't be in the future"
  if (startedAt && completedAt && startedAt > completedAt) return "It can't be finished before it was started"
  return null
}
