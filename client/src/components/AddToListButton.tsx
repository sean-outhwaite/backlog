import { useState, type ReactNode } from 'react'
import { CheckIcon, PlusIcon } from './icons'
import { Spinner } from './Spinner'

export function AddToListButton({
  added,
  onAdd,
  label = 'Backlog',
  icon = <PlusIcon />,
  primary = true,
  title,
}: {
  added: boolean
  onAdd: () => Promise<void>
  label?: string
  icon?: ReactNode
  primary?: boolean
  title?: string
}) {
  const [adding, setAdding] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleClick() {
    setAdding(true)
    setFailed(false)
    try {
      await onAdd()
    } catch {
      setFailed(true)
    } finally {
      setAdding(false)
    }
  }

  let content
  if (adding) {
    content = (
      <>
        <Spinner />
        Adding…
      </>
    )
  } else if (added) {
    content = (
      <>
        <CheckIcon />
        Added
      </>
    )
  } else {
    content = (
      <>
        {icon}
        {failed ? 'Try again' : label}
      </>
    )
  }

  return (
    <button
      className={`${primary ? 'btn-primary ' : ''}add-button${added ? ' is-added' : ''}`}
      title={title}
      onClick={() => void handleClick()}
      disabled={adding || added}
      aria-busy={adding}
    >
      {content}
    </button>
  )
}
