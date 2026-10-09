import { useSearchParams } from 'react-router-dom'
import type { ListStatus } from '../types'

export const STATUS_TABS: { status: ListStatus; label: string }[] = [
  { status: 'want', label: 'Backlog' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
]

// The tab lives in the URL so it survives a reload and other views can link to a tab.
export function useStatusParam(): [ListStatus, (status: ListStatus) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = STATUS_TABS.find((tab) => tab.status === searchParams.get('status'))?.status ?? 'want'
  const setStatus = (next: ListStatus) => setSearchParams(next === 'want' ? {} : { status: next }, { replace: true })
  return [status, setStatus]
}
