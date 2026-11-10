import { useCallback, useEffect, useRef, useState } from 'react'
import type { Screenshot } from '../types'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

// A swipeable row of a title's screenshots in its details; each opens full size in a viewer.
export function Screenshots({ screenshots, title }: { screenshots: Screenshot[]; title: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

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
  }, [updateArrows, screenshots.length])

  function page(direction: 1 | -1) {
    const track = trackRef.current
    track?.scrollBy({ left: direction * track.clientWidth })
  }

  return (
    <section className="screenshots" aria-label="Screenshots">
      <div className="screenshots-track" ref={trackRef} onScroll={updateArrows}>
        {screenshots.map((shot, i) => (
          <button
            key={shot.url}
            type="button"
            className="screenshot-thumb"
            onClick={() => setOpen(i)}
            aria-label={`Screenshot ${i + 1} of ${screenshots.length}`}
          >
            <img src={shot.thumbnailUrl} alt="" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      {canPrev && (
        <button className="carousel-arrow screenshots-arrow--prev btn-icon" aria-label="Previous" onClick={() => page(-1)}>
          <ChevronLeftIcon />
        </button>
      )}
      {canNext && (
        <button className="carousel-arrow screenshots-arrow--next btn-icon" aria-label="Next" onClick={() => page(1)}>
          <ChevronRightIcon />
        </button>
      )}
      {open !== null && (
        <ScreenshotViewer
          screenshots={screenshots}
          index={open}
          title={title}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}

function ScreenshotViewer({
  screenshots,
  index,
  title,
  onIndex,
  onClose,
}: {
  screenshots: Screenshot[]
  index: number
  title: string
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const count = screenshots.length
  const go = (step: 1 | -1) => onIndex((index + step + count) % count)

  useEffect(() => {
    // Guarded because StrictMode runs this twice, and showModal throws on an open dialog.
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // The next shot, so stepping through doesn't wait on each 1080p image.
  useEffect(() => {
    if (count > 1) new Image().src = screenshots[(index + 1) % count].url
  }, [index, count, screenshots])

  return (
    <dialog
      ref={dialogRef}
      className="screenshot-viewer"
      aria-label={`${title} screenshots`}
      onClose={(event) => {
        // React bubbles close up to the details dialog, which would close it too.
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => {
        // Clicks on the image itself don't close it; anywhere else around it does.
        event.stopPropagation()
        if (event.target === event.currentTarget || event.target === event.currentTarget.firstElementChild) {
          dialogRef.current?.close()
        }
      }}
      onKeyDown={(event) => {
        if (count < 2) return
        if (event.key === 'ArrowLeft') go(-1)
        if (event.key === 'ArrowRight') go(1)
      }}
    >
      <div className="screenshot-viewer-stage">
        <img src={screenshots[index].url} alt={`${title}, screenshot ${index + 1} of ${count}`} />
      </div>
      <button className="screenshot-viewer-close btn-icon" onClick={() => dialogRef.current?.close()} aria-label="Close">
        ✕
      </button>
      {count > 1 && (
        <>
          <button className="carousel-arrow screenshot-viewer-prev btn-icon" aria-label="Previous" onClick={() => go(-1)}>
            <ChevronLeftIcon />
          </button>
          <button className="carousel-arrow screenshot-viewer-next btn-icon" aria-label="Next" onClick={() => go(1)}>
            <ChevronRightIcon />
          </button>
          <p className="screenshot-viewer-count" aria-live="polite">
            {index + 1} / {count}
          </p>
        </>
      )}
    </dialog>
  )
}
