import { env } from './env.js'

// Avatars live in a public Supabase Storage bucket, one object per user (named by id alone, so a
// WebP and a JPEG upload overwrite each other), overwritten on change.
// Called through Storage's REST API with the service role key, rather than pulling in supabase-js.
const BUCKET = 'avatars'

export class AvatarStorageUnavailableError extends Error {}

function storageRequest(userId: string, init: RequestInit) {
  const key = env.supabaseServiceRoleKey
  if (!key) throw new AvatarStorageUnavailableError('SUPABASE_SERVICE_ROLE_KEY is not set')
  return fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${userId}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
  })
}

// Returns the public URL, versioned so browsers and the CDN pick up a new photo (the short cache
// lifetime covers any cache that ignores the query string).
export async function uploadAvatar(userId: string, image: Buffer, contentType: string): Promise<string> {
  const response = await storageRequest(userId, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'Cache-Control': '3600', 'x-upsert': 'true' },
    body: image,
  })
  if (!response.ok) throw new Error(`Avatar upload failed: ${response.status} ${await response.text()}`)
  return `${env.supabaseUrl}/storage/v1/object/public/${BUCKET}/${userId}?v=${Date.now()}`
}

export async function deleteAvatar(userId: string): Promise<void> {
  const response = await storageRequest(userId, { method: 'DELETE' })
  // Already gone is fine: the profile just stops pointing at it.
  if (!response.ok && response.status !== 404 && response.status !== 400) {
    throw new Error(`Avatar delete failed: ${response.status} ${await response.text()}`)
  }
}
