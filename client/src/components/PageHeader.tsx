import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  )
}

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      {children}
    </div>
  )
}
