# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install               # installs both workspaces (client + server)
pnpm dev                   # runs client (Vite) and server (tsx watch) together via concurrently
pnpm build                 # builds server then client (each runs tsc -b first)
pnpm test                  # runs the server's Vitest unit tests once (pnpm exec vitest inside server/ to watch)
pnpm prisma:generate       # regenerate Prisma client after editing schema.prisma
pnpm prisma:migrate        # create + apply a migration (prompts for a name)
```

Tests are Vitest, server only, colocated as `server/src/**/*.test.ts` (excluded from the `tsc -b` build, so they aren't typechecked by `pnpm build`). They cover pure logic only (search ranking, series status, release helpers) and must never hit the database or network: modules that import `lib/prisma.js` or `providers/index.js` (the providers throw at import without API keys) get those mocked with `vi.mock` before the module under test is imported. The client has no tests.

`client/` lints with `oxlint` (`pnpm lint` inside `client/`), not eslint. Warnings don't fail the build.

**pnpm, not npm.** The repo moved off npm because npm 11 drops other platforms' optional native binaries (`@rolldown/binding-linux-x64-gnu`, `lightningcss-linux-x64-gnu`) when it updates an existing lockfile on macOS, which broke a Vercel deploy once; `pnpm-lock.yaml` always records every platform's. The version is pinned in `packageManager` (root `package.json`) and in `vercel.json`'s `installCommand` (Vercel would otherwise pick pnpm 9 or 10 on its own); bump both together. pnpm 10 only runs install scripts for packages listed in `pnpm.onlyBuiltDependencies` (Prisma, esbuild): a new dependency that needs its postinstall must be added there. pnpm's `node_modules` is strict, so a workspace can only import packages its own `package.json` lists.

`pnpm.overrides` in the root `package.json` forces `deepmerge-ts` to ^8 because `@prisma/config` 6.x pins 7.1.5 (GHSA-ggr8-5vv4-36mx). Remove it when moving to Prisma 7.

## Architecture

pnpm workspaces monorepo (`pnpm-workspace.yaml`): `client/` (Vite + React + TypeScript + React Router SPA) and `server/` (Express + TypeScript API, Prisma ORM). No shared package between them — types are duplicated by hand in `client/src/types.ts` to mirror the Prisma models.

**Auth + database is Supabase, but auth verification does NOT use a shared secret.** This project's Supabase JWTs are signed asymmetrically (ES256), not with the legacy HS256 shared secret. `server/src/middleware/auth.ts` verifies every request's bearer token against the project's live JWKS endpoint (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`) using `jose`'s `createRemoteJWKSet` + `jwtVerify` — there is no `SUPABASE_JWT_SECRET` env var, only `SUPABASE_URL`. If a fresh Supabase project somehow uses the legacy secret system instead, this JWKS-based verification will fail; check Project Settings -> API -> JWT Signing Keys to see which system a given project is on.

The client never calls Supabase directly except for `@supabase/supabase-js` auth (magic-link sign-in via `signInWithOtp` and Google via `signInWithOAuth`, both returning through `/auth/callback`; session storage, `onAuthStateChange`). All other data access goes through our own Express API (`client/src/lib/api.ts` attaches the current Supabase access token as a Bearer header on every call). `requireAuth` middleware upserts a `Profile` row for the token's `sub` on first authenticated request — there's no separate signup endpoint.

### Database connection gotchas (Supabase free tier)

- **Use the session pooler connection string for `DATABASE_URL`, not "Direct connection."** The direct host (`db.<ref>.supabase.co:5432`) is IPv6-only on the free plan and will fail to connect (`P1001`) from most home networks. Get the session-mode string from Supabase dashboard -> Connect -> "Session pooler" tab (host looks like `aws-0-<region>.pooler.supabase.com`, username `postgres.<project-ref>`). It supports everything `prisma migrate` needs (advisory locks, prepared statements) unlike the transaction-mode pooler on port 6543. **Make sure the port is 5432:** with the transaction pooler (6543), `prisma migrate deploy` hangs indefinitely after printing the datasource line, waiting on its advisory lock.
- **`DATABASE_URL` has `?connection_limit=10` appended on purpose.** The free-tier session pooler caps concurrent connections at 15 (`pool_size`). Without this, a burst of concurrent Prisma queries can exceed that cap and crash the whole process — this actually happened during initial testing. Keep some version of this cap if `DATABASE_URL` is ever regenerated from the dashboard.

### Server error handling

Every route handler is wrapped in `asyncHandler` (`server/src/lib/asyncHandler.ts`), and `index.ts` registers a final Express error-handling middleware. This is load-bearing, not decorative: Express 4 does not catch rejected promises from `async` route handlers automatically, so an unhandled rejection (e.g. a DB error) crashes the entire Node process rather than just failing that one request. Any new route must go through `asyncHandler`.

### Ports

Client dev server is pinned to **5174** (not Vite's default 5173) in `client/vite.config.ts`, specifically to avoid colliding with other local projects (e.g. `shoplock`) that use the default port. Server reads its own port from `API_PORT`, not `PORT` — this is deliberate: some tooling (e.g. dev-server preview harnesses) injects a `PORT` env var into the whole process tree, and the server previously bound to the wrong port because of that collision. Don't rename it back to `PORT`.

### Media search / caching

`server/src/providers/{tmdb,openlibrary,rawg}.ts` each implement a common `MediaProvider` interface (`search`, `getById`) returning a normalized shape, regardless of how different the underlying API is. `server/src/routes/media.ts` searches all relevant providers in parallel (`Promise.allSettled`, with a per-call timeout, so one flaky provider doesn't fail the whole search) and returns their results directly — **search never touches the database.** Results from all providers are merged and sorted by `rankSearchResults` (`server/src/lib/searchRanking.ts`): title-match score plus log-scaled popularity, where each provider maps `popularity` from a comparable "people who engaged" count (TMDB `vote_count`, Open Library `readinglog_count`, RAWG `added`). Provider orders can't be compared directly, and popularity is what separates e.g. the Metal Gear Solid game from an obscure fan film with the same title. A `MediaItem` row is created lazily by `resolveMediaItem` (`server/src/lib/mediaItems.ts`) the first time a title is added to a list or recommended: the client sends `{ type, externalId }` and the server fetches details via the provider's `getById` rather than trusting client-sent metadata. Endpoints that take a title accept either that or an existing `{ mediaItemId }` (`mediaRefSchema`). Every downstream feature (`ListEntry`, `Recommendation`) references `MediaItem.id`, never a copy of the title/cover/description; `MediaItem` is unique on `(source, type, externalId)` — `type` is in the key because TMDB movie and TV ids are separate namespaces that can collide.

### Series

A series (Open Library books, via `series_key`/`series_position` on its search index, and TMDB movie collections, ordered by release date with unreleased films left out) is a `MediaItem` with `kind = 'series'`, so it can be listed and recommended like any title; `kind` is part of `MediaItem`'s unique key. Its volumes are ordinary title `MediaItem`s linked through `SeriesVolume` (created together, in `resolveSeries` in `server/src/lib/mediaItems.ts`, the first time anyone adds the series). New volumes are picked up by `refreshSeries`, which re-fetches a series at most once a day when someone adds it or opens its volumes (no cron: the user base is small enough that someone opening it is enough). A new volume moves every user's `done` entry for that series back to `in_progress`. A user's per-volume progress lives in `VolumeProgress` (no row = `want`), and changing a volume moves the series entry's own status along (`derivedSeriesStatus` in `server/src/lib/series.ts`). Book search results carry a `series` ref, which gets an "Add series" button on the card; TMDB movie results don't say, so `searchSeries` runs TMDB's collection search alongside and returns whole series as their own results (`kind: 'series'`), and a movie's details (`getById`) carry its collection so the details view can offer it. RAWG's game-series data (no series name, id or order; mixes in spin-offs and re-releases) isn't used. Works whose position isn't a plain number (box sets, "1-7") are left out of a series' volumes.

### Notifications

`Notification` rows (`recommendation` | `released`) point at an actor and a `MediaItem` rather than at a `Recommendation`, so they're inserted in parallel with what caused them. The client polls unread counts (`GET /api/notifications/unread`, one `groupBy`) on navigation, tab focus and every 2 minutes; there's no realtime. `Recommendation.viewedAt` is no longer written.

### Lists ("Collections")

`Collection`/`CollectionItem` are named lists separate from the backlog (`ListEntry`); the code says Collection to avoid clashing with `/api/lists`, the UI says "Lists". Each user has one `kind = 'picks'` collection, made lazily by `ensurePicks`; "one per user" is a partial unique index written by hand in the migration (Prisma can't express it), so don't expect it in `schema.prisma`. Friends can read each other's collections; friends' picks feed the Recommendations page.

### Release tracking

Providers return `releaseDate` (exact dates only) and `unreleased` (future date, TMDB status before "Released", RAWG `tba`, or Open Library's earliest exactly-dated edition still to come). Stored as `MediaItem.releaseDate` / `releasePending` / `releaseCheckedAt` via `releaseColumns` (`server/src/lib/releases.ts`). A title only counts as upcoming (`isOut` / `isOutWhere`, mirrored by `isUpcoming` in the client) once a check has seen it as such: a null `releaseCheckedAt` means "never seen upcoming", which keeps backfilled rows from being announced. Unreleased series volumes are shown but excluded from progress totals and can't be marked started/done; they reopen finished series only when they come out. A daily Vercel cron (`vercel.json`, 20:00 UTC) calls `GET /api/cron/releases` with `Authorization: Bearer $CRON_SECRET` (mounted outside `requireAuth`); it re-checks a batch of tracked pending titles and announces the ones now out.

### Profile photos

Stored in a public Supabase Storage bucket `avatars` (one object per user id, overwritten), uploaded by the server with `SUPABASE_SERVICE_ROLE_KEY` after the client crops and shrinks the image (WebP, or JPEG where the canvas can't encode WebP). Without the key, uploads return 503 and the rest of the app works.

### Friends model

Invite-link based, not mutual search/discovery. `InviteLink` is one reusable token per user (created lazily). Redeeming someone else's link creates a `Friendship` row; `Friendship` is stored once per pair and `areFriends()` (`server/src/lib/friendship.ts`) checks both directions since there's no canonical ordering enforced.

## Known gaps (not yet addressed)

- **Row Level Security relies on project config, not migrations.** The current Supabase project has RLS enabled on every table, plus an auto-enable function that turns it on for newly created tables, with no policies, so `anon`/`authenticated` are default-denied through Supabase's Data API (the anon key is public in the client bundle). Our server connects as `postgres`, which bypasses RLS, so it's unaffected. The migrations themselves contain no RLS statements, so a fresh database (new Supabase project, local Postgres) won't have this unless that auto-enable setup is recreated, or RLS is added as a tracked migration.
- **DB round trips are the main latency cost.** The project was moved from Singapore (~205ms RTT) to Sydney (`ap-southeast-2`) to cut this, but every sequential query still costs a full round trip (a statement's first run on a connection costs 2 round trips while Prisma prepares it), so request latency scales with the number of sequential queries. Keep query counts low on hot paths: Prisma's `upsert` (unless it qualifies for native `ON CONFLICT`), `createMany`, and any `include` expand into 3–6 statement transactions, whereas a plain `create` is one `INSERT ... RETURNING`. The pattern used instead is create-then-catch-P2002 (`isUniqueConstraintError` in `server/src/lib/prisma.ts`), attaching related rows in code rather than via `include`. `requireAuth` only ensures a `Profile` row once per user per process (in-memory set). The Vercel deployment pins functions to `syd1` for this reason.

### Deployment (Vercel)

One Vercel project at the repo root serves both halves (`vercel.json`): `client/dist` as static files with an SPA fallback to `index.html`, and every `/api/*` request rewritten to `api/index.mjs`, which re-exports the Express `app` from the compiled `server/dist/app.js` (`server/src/index.ts` only adds `listen` for local dev). Client and API share an origin, so in production builds `API_BASE` defaults to `''`. `/invite/*` is also rewritten to the function (`server/src/routes/invitePage.ts`), which serves the built `index.html` (bundled via `includeFiles`) with link-preview tags naming the inviter, since Discord etc. don't run scripts; locally Vite serves that path itself, so the preview only exists on Vercel. Functions run in `syd1`, next to the DB. Production `DATABASE_URL` uses the **transaction** pooler (6543, `?pgbouncer=true&connection_limit=3`), not the session pooler: serverless instances each open their own pool and would exhaust the session pooler's 15-connection cap. Migrations are still run locally against the session pooler. Supabase Auth's Site URL / redirect URLs must include the deployed origin for magic links (`/auth/callback`) to work.

**Production lives at `https://backlog.outh.nz`.** DNS for `outh.nz` is at SiteHost, with every record in the one `outh.nz` zone (no per-subdomain zones: a zone's root can't hold a CNAME, and a sub-zone hides records for its names in the parent). **Auth emails go through custom SMTP (Resend), not Supabase's built-in sender**, whose project-wide hourly cap was the bottleneck: sending domain `mail.outh.nz`, sender `backlog@mail.outh.nz`, configured in Supabase (Authentication → Emails → SMTP Settings, limit under Rate Limits). None of this is in the repo; a new Supabase project needs the SMTP settings re-entered or it silently falls back to the built-in limit.

**Rate limiting lives in the Vercel Firewall, not in code.** A dashboard rule (Firewall → Rules; see there for the current limit) rate-limits `/api/media/*` per IP, since search and details fan out to TMDB / Open Library / RAWG and their quotas (RAWG's especially) are the scarce resource. It isn't in `vercel.json`, so it won't show up in the repo and doesn't apply to the local dev server.

**Security headers (CSP etc.) are set in `vercel.json`'s `headers`, so they only exist on Vercel**, not on the Vite dev server. The CSP allowlists every outside origin the client uses: Google Fonts, Google Identity Services (`accounts.google.com/gsi/*`: script, style, iframe, fetch), and the Supabase project URL (hardcoded, for auth calls). `img-src` allows any `https:` because covers come from several CDNs (TMDB, RAWG, Open Library, which redirects to archive.org) plus Supabase Storage avatars. Adding a new external script, stylesheet, font, iframe or API call from the browser means adding its origin here, or it's silently blocked in production only. A new Supabase project also means updating the URL in `connect-src`.

`requireAuth` checks the token's issuer (`<SUPABASE_URL>/auth/v1`) and audience (`authenticated`), and rejects Supabase anonymous sessions (`is_anonymous`), not just the JWKS signature.

### Migrations

There is only one database (the live Supabase project) — no dev/shadow DB. **Never pass `DATABASE_URL` as `--shadow-database-url`**: Prisma resets the shadow database, and doing so once wiped every app table. `prisma migrate dev` is interactive; to generate SQL non-interactively use `prisma migrate diff --from-schema-datamodel <old schema> --to-schema-datamodel prisma/schema.prisma --script` (no DB connection needed), then `prisma migrate deploy`.

## Git

Always ask before committing, never commit unless explicitly instructed.
