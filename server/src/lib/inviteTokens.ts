import { randomBytes } from 'node:crypto'

// 9 random bytes, which base64url always encodes as 12 URL-safe characters.
export function newInviteToken() {
  return randomBytes(9).toString('base64url')
}

// Whether a string could be a token at all, so obviously junk links skip the database.
export function isInviteTokenShaped(token: string) {
  return /^[A-Za-z0-9_-]{12}$/.test(token)
}
