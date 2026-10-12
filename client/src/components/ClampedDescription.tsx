import { useEffect, useRef, useState, type CSSProperties } from 'react'

// A description cut to a few lines, with a toggle to read the rest. The toggle only shows when
// the text is actually cut off, measured rather than guessed from its length, since that depends
// on the container's width. Key it by the item it describes so switching items starts collapsed.
export function ClampedDescription({ text, className, lines }: { text: string; className: string; lines: number }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || expanded) return
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <div className="clamped-description">
      <p
        ref={ref}
        className={`${className}${expanded ? '' : ' is-clamped'}`}
        style={{ '--clamp-lines': lines } as CSSProperties}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button className="clamped-description-more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
