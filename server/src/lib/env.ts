function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  supabaseUrl: required('SUPABASE_URL'),
  // Server-only key for writing avatars to Storage. Optional so the app still runs without it;
  // avatar uploads fail with 503 until it's set.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Shared with Vercel Cron, which sends it as a bearer token. Without it the cron routes refuse.
  cronSecret: process.env.CRON_SECRET,
  tmdbApiKey: required('TMDB_API_KEY'),
  // A Twitch app's credentials, for IGDB (games). dev.twitch.tv -> Console -> Applications.
  twitchClientId: required('TWITCH_CLIENT_ID'),
  twitchClientSecret: required('TWITCH_CLIENT_SECRET'),
  openLibraryContact: process.env.OPEN_LIBRARY_CONTACT,
  // Web Push (VAPID) keys, from `npx web-push generate-vapid-keys`, and a contact (mailto: or
  // https:) push services can reach us at. Optional: without all three, push is off and
  // GET /api/push/key returns 503. Changing the keys invalidates every stored subscription.
  vapid:
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
      ? {
          publicKey: process.env.VAPID_PUBLIC_KEY,
          privateKey: process.env.VAPID_PRIVATE_KEY,
          subject: process.env.VAPID_SUBJECT,
        }
      : null,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5174',
}
