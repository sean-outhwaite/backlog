# Backlog

Track movies, TV, books, and games you want to consume, mark them done, and recommend them to friends.

## Stack

- `client/` — Vite + React + TypeScript, React Router, `@supabase/supabase-js` for auth
- `server/` — Express + TypeScript API, Prisma ORM
- Auth + database: [Supabase](https://supabase.com) (magic-link email sign-in, hosted Postgres)
- Media data: [TMDB](https://www.themoviedb.org/documentation/api) (movies/TV), [Open Library](https://openlibrary.org/developers/api) (books, no key needed), [RAWG](https://rawg.io/apidocs) (games)

## One-time setup

You'll need to create three free accounts and collect their keys — this project can't do that part for you.

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication -> Providers**, make sure **Email** is enabled with **magic link** (OTP) sign-in — no password required.
3. In **Authentication -> URL Configuration**, add `http://localhost:5174/auth/callback` as a redirect URL.
4. Collect these from **Project Settings**:
   - **API -> Project URL** and **API -> anon public key**
   - **Database -> Connect -> Session pooler** connection string (not "Direct connection" — see the note in `server/.env.example`)

The API verifies your Supabase-issued JWTs against your project's public JWKS endpoint (`<project-url>/auth/v1/.well-known/jwks.json`), so there's no shared secret to copy — just the project URL, same one used on the client.

### 2. TMDB

1. Create an account at [themoviedb.org](https://www.themoviedb.org), then **Settings -> API** to request a free API key (v3 auth).

### 3. RAWG

1. Create an account at [rawg.io](https://rawg.io/apidocs) and grab your API key from your account page.

### 4. Fill in env files

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

Fill in `client/.env`:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` from Supabase

Fill in `server/.env`:

- `SUPABASE_URL`, `DATABASE_URL` from Supabase
- `TMDB_API_KEY` from TMDB
- `RAWG_API_KEY` from RAWG

### 5. Install and migrate

```bash
npm install
npm run prisma:migrate
```

## Running

```bash
npm run dev
```

This starts the client (http://localhost:5174) and API (http://localhost:4000) together.

## Notes

- The API never stores a password — it verifies the Supabase-issued JWT on every request.
- TMDB/RAWG API keys stay server-side; the client only ever talks to our own API.
- `npm audit` currently flags a high-severity advisory in a transitive dependency of the `prisma` CLI (`deepmerge-ts`, via `@prisma/config`). It's a dev-only build tool, not part of the running server, and the fix requires a Prisma major-version bump — worth revisiting later, not urgent.
