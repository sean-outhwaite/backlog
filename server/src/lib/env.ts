function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  supabaseUrl: required('SUPABASE_URL'),
  tmdbApiKey: required('TMDB_API_KEY'),
  rawgApiKey: required('RAWG_API_KEY'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5174',
}
