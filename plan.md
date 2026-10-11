# Plan for todo.md

Phases in order; each builds on the ones before. Schema changes get a migration generated with
`prisma migrate diff` and applied with `migrate deploy` (no shadow DB, see CLAUDE.md).

## 1. Custom avatars + friend avatar on their backlog (done)

- `Profile.avatarUrl String?`. Public Supabase Storage bucket `avatars`, one object per user
  (`<userId>`), written by the server with `SUPABASE_SERVICE_ROLE_KEY` (server-only env var).
- `PUT /api/profile/avatar` (raw WebP or JPEG body) and `DELETE /api/profile/avatar`. Stored URL gets
  `?v=<timestamp>` so a new photo isn't served from cache.
- A picked photo is positioned under a circle first (drag/arrow keys to pan, slider/+/- to zoom),
  then the client crops it and resizes to 256px WebP (JPEG on Safari) in a canvas before upload
  (~30KB; Vercel's body limit is 4.5MB).
- Shared `<Avatar>` component replaces the hand-rolled initials. No photo -> initial (no Google
  picture fallback).
- "Change photo" in the user menu. Friend page heading shows their avatar. Privacy page updated.

## 2. Notifications (shared), starting with recommendations (done)

- `Notification (id, userId, type: recommendation | released, recommendationId?, mediaItemId?,
readAt?, createdAt)`, indexed on `(userId, readAt)`.
- Created per recipient alongside each recommendation (plain `create`s, in parallel).
- `GET /api/notifications` (latest 30 + unread count), `POST /api/notifications/read`.
- Bell with unread dot next to the user menu (in the page header on small screens) and a count
  badge on the Recommendations nav item; refreshed on route change and tab focus. Opening
  Recommendations marks them read (replaces the `viewedAt` loop).

## 3. "Popular with friends" (done)

- `GET /api/media/popular/friends`: friends' `ListEntry` rows grouped by `mediaItemId`, scored by
  distinct friends (small bump for in_progress/done), ties by recency, excluding your own list.
  Top 12, with which friends have each (for avatars).
- Separate row above "Popular right now" on Search, and in the Recommendations fallback. Hidden
  when empty.

## 4. Named lists + "My picks" (done)

- `Collection (id, ownerId, name, description?, kind: custom | picks, position, createdAt)` and
  `CollectionItem (collectionId, mediaItemId, note?, position, addedAt)`, unique on
  `(collectionId, mediaItemId)`. "My picks" is created lazily. UI calls them "Lists".
- CRUD for your own; `GET /api/friends/:id/collections` (friends only); `GET /api/collections/feed`
  for friends' recent picks.
- Lists page; "Add to list…" on cards (with optional note), "Pick for friends" shortcut; friend page
  gets Backlog | Lists tabs; Recommendations page gets a "Friends' picks" section.
- No notifications for picks.
- As built: "Add to a list" lives in the details dialog (every card opens it). Items are newest
  first with no reordering yet; a friend's Lists tab only shows non-empty lists.

## 5. Pre-release tracking (movies, games, books) (done)

- `MediaItem.releaseDate DateTime?`, `releaseCheckedAt`, `releaseNotifiedAt` (keep `releaseYear`).
- Providers return a full date when known: TMDB `release_date`; RAWG `released` (ignored when
  `tba`); Open Library only exact `publish_date`s ("2026-10-26", "Jul 16, 2026"), upcoming only if
  every exactly-dated edition is in the future. Year-only never counts.
- Cards/search results show "Upcoming · 26 Oct" / "Out now".
- Daily Vercel cron -> `/api/cron/releases` (outside `requireAuth`, checks `CRON_SECRET`), 20:00 UTC:
  re-fetch dates for listed upcoming/recently released items (bounded concurrency), notify everyone
  with the item (or its series) on their list once released, stamp `releaseNotifiedAt`.
- Series: keep unreleased volumes, shown as upcoming; progress totals and `derivedSeriesStatus`
  count released volumes only; "done -> in_progress" moves from "volume added" to "volume released".
  TMDB collections stop filtering unreleased films. (Open Library series don't filter by date today,
  so an announced volume may already reopen finished series.)
