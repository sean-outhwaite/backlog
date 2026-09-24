import { useState } from 'react'
import { CheckIcon, PlusIcon } from './icons'
import { Spinner } from './Spinner'

export function AddToListButton({ added, onAdd }: { added: boolean; onAdd: () => Promise<void> }) {
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
        <PlusIcon />
        {failed ? 'Try again' : 'Add to list'}
      </>
    )
  }

  return (
    <button
      className={`btn-primary add-button${added ? ' is-added' : ''}`}
      onClick={() => void handleClick()}
      disabled={adding || added}
      aria-busy={adding}
    >
      {content}
    </button>
  )
}
