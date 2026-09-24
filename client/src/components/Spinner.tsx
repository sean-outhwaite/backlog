export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="page-status" role="status">
      <Spinner />
      {label}
    </p>
  )
}
