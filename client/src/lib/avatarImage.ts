// Avatars are shown at most ~96px, so 256px covers high-density screens with room to spare.
const SIZE = 256
const QUALITY = 0.85

// A picked photo: decoded for drawing, plus a URL to show it while it's being positioned.
export interface PickedImage {
  bitmap: ImageBitmap
  url: string
}

// The square of the photo to keep, in the photo's own pixels.
export interface AvatarCrop {
  x: number
  y: number
  side: number
}

export async function pickImage(file: File): Promise<PickedImage> {
  const bitmap = await createImageBitmap(file)
  return { bitmap, url: URL.createObjectURL(file) }
}

export function releaseImage(image: PickedImage) {
  image.bitmap.close()
  URL.revokeObjectURL(image.url)
}

// The largest square in the middle of the photo: where the crop starts before any panning.
export function centreCrop({ width, height }: ImageBitmap): AvatarCrop {
  const side = Math.min(width, height)
  return { x: (width - side) / 2, y: (height - side) / 2, side }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

// Cuts the chosen square out of the photo and shrinks it, so the upload is ~30KB rather than a
// multi-megabyte phone photo. WebP where the browser can encode it; Safari's canvas can't (it
// quietly returns a PNG), so JPEG there.
export async function cropAvatar(bitmap: ImageBitmap, crop: AvatarCrop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  // JPEG has no transparency, and a transparent PNG would otherwise come out black.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, SIZE, SIZE)
  context.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, SIZE, SIZE)

  const webp = await toBlob(canvas, 'image/webp')
  if (webp?.type === 'image/webp') return webp
  const jpeg = await toBlob(canvas, 'image/jpeg')
  if (!jpeg) throw new Error('Could not encode image')
  return jpeg
}
