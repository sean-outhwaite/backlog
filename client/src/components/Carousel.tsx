import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

// A row of cards scrolled a page at a time, with arrows only where there's more to see.
export function Carousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)
  const count = Children.count(children)

  const updateArrows = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    setCanPrev(track.scrollLeft > 1)
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    updateArrows()
    const observer = new ResizeObserver(updateArrows)
    observer.observe(track)
    return () => observer.disconnect()
  }, [updateArrows, count])

  // Scrolls a viewful; snapping lines the next card up with the edge. Smoothness comes from the CSS.
  function page(direction: 1 | -1) {
    const track = trackRef.current
    track?.scrollBy({ left: direction * track.clientWidth })
  }

  return (
    <div className="carousel">
      <div className="carousel-track" ref={trackRef} onScroll={updateArrows}>
        {children}
      </div>
      {canPrev && (
        <button className="carousel-arrow carousel-arrow--prev btn-icon" aria-label="Previous" onClick={() => page(-1)}>
          <ChevronLeftIcon />
        </button>
      )}
      {canNext && (
        <button className="carousel-arrow carousel-arrow--next btn-icon" aria-label="Next" onClick={() => page(1)}>
          <ChevronRightIcon />
        </button>
      )}
    </div>
  )
}
