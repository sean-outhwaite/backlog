import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  )
}

export function EmptyState({
  icon,
  className,
  children,
}: {
  icon?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className ? `empty-state ${className}` : 'empty-state'}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      {children}
    </div>
  )
}
