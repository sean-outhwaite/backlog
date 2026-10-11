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
  tmdbApiKey: required('TMDB_API_KEY'),
  rawgApiKey: required('RAWG_API_KEY'),
  openLibraryContact: process.env.OPEN_LIBRARY_CONTACT,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5174',
}
