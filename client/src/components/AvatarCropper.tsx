import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { AvatarCrop, PickedImage } from '../lib/avatarImage'

// Matches .avatar-cropper's size in App.css.
const VIEWPORT = 240
const MAX_ZOOM = 4
const KEY_STEP = 10

// Where the photo sits in the viewport: its top-left corner, in viewport pixels, and how far it's
// zoomed past just covering the viewport.
interface View {
  x: number
  y: number
  zoom: number
}

// Drag (or arrow keys) to move a photo around under the circle, and zoom in with the slider.
// Reports the square under the viewport, in the photo's own pixels, on every change.
export function AvatarCropper({ image, onChange }: { image: PickedImage; onChange: (crop: AvatarCrop) => void }) {
  const { width, height } = image.bitmap
  // Zoom 1 is the photo's shorter side exactly filling the viewport.
  const baseScale = VIEWPORT / Math.min(width, height)
  const scaleAt = (zoom: number) => baseScale * zoom

  // Never leaves a gap: the photo always covers the whole viewport.
  function clamp(view: View): View {
    const scale = scaleAt(view.zoom)
    return {
      zoom: view.zoom,
      x: Math.min(0, Math.max(VIEWPORT - width * scale, view.x)),
      y: Math.min(0, Math.max(VIEWPORT - height * scale, view.y)),
    }
  }

  const [view, setView] = useState<View>(() => {
    const scale = scaleAt(1)
    return { zoom: 1, x: (VIEWPORT - width * scale) / 2, y: (VIEWPORT - height * scale) / 2 }
  })
  // The latest view, for pointer moves that arrive faster than renders.
  const viewRef = useRef(view)
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)

  function update(next: View) {
    const clamped = clamp(next)
    viewRef.current = clamped
    setView(clamped)
    const scale = scaleAt(clamped.zoom)
    onChange({ x: -clamped.x / scale, y: -clamped.y / scale, side: VIEWPORT / scale })
  }

  const moveBy = (dx: number, dy: number) => update({ ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy })

  // Zooms around the middle of the viewport, so whatever's centred stays centred.
  function zoomTo(zoom: number) {
    const current = viewRef.current
    const nextZoom = Math.min(MAX_ZOOM, Math.max(1, zoom))
    const centreX = (VIEWPORT / 2 - current.x) / scaleAt(current.zoom)
    const centreY = (VIEWPORT / 2 - current.y) / scaleAt(current.zoom)
    update({
      zoom: nextZoom,
      x: VIEWPORT / 2 - centreX * scaleAt(nextZoom),
      y: VIEWPORT / 2 - centreY * scaleAt(nextZoom),
    })
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    moveBy(event.clientX - drag.x, event.clientY - drag.y)
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    }
    // Arrows move the frame over the photo, so the photo itself moves the other way.
    const move = moves[event.key]
    if (move) moveBy(...move)
    else if (event.key === '+' || event.key === '=') zoomTo(viewRef.current.zoom + 0.25)
    else if (event.key === '-') zoomTo(viewRef.current.zoom - 0.25)
    else return
    event.preventDefault()
  }

  const scale = scaleAt(view.zoom)

  return (
    <div className="avatar-cropper-wrap">
      <div
        className="avatar-cropper"
        tabIndex={0}
        role="group"
        aria-label="Photo position. Drag, or use the arrow keys, to move it; plus and minus to zoom."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <img
          src={image.url}
          alt=""
          draggable={false}
          style={{ width: width * scale, height: height * scale, transform: `translate(${view.x}px, ${view.y}px)` }}
        />
        <span className="avatar-cropper-mask" aria-hidden="true" />
      </div>
      <input
        className="avatar-cropper-zoom"
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={view.zoom}
        aria-label="Zoom"
        onChange={(event) => zoomTo(Number(event.target.value))}
      />
    </div>
  )
}
