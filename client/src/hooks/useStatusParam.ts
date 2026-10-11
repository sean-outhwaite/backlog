import { useSearchParams } from 'react-router-dom'
import type { ListStatus } from '../types'

// The list's tabs: one per status, plus Preorders for titles that aren't out yet (see entryTab).
export type ListTab = ListStatus | 'upcoming'

export const STATUS_TABS: { status: ListTab; label: string }[] = [
  { status: 'want', label: 'Backlog' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
  { status: 'upcoming', label: 'Preorders' },
]

// The tab lives in the URL so it survives a reload and other views can link to a tab.
export function useStatusParam(): [ListTab, (status: ListTab) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = STATUS_TABS.find((tab) => tab.status === searchParams.get('status'))?.status ?? 'want'
  const setStatus = (next: ListTab) => setSearchParams(next === 'want' ? {} : { status: next }, { replace: true })
  return [status, setStatus]
}
