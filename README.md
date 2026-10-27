# Backlog

A shared to-watch, to-read and to-play list for you and your friends.

Backlog keeps the movies, TV shows, books and games you want to get to in one place. Search all of them from a single search box, add titles to your list, and move each one from **want** to **in progress** to **done**.

- **One search across every medium.** Results from movies, TV, books and games are merged and ranked together, so a popular title comes before an obscure one with the same name.
- **Series tracking.** Add a book series or a movie collection as one entry and track progress volume by volume. Your series status updates as you go, and when a new volume comes out, a finished series moves back to in progress.
- **Release tracking.** Movies, games and books that aren't out yet show their release date (including announced volumes of a series), and you get a notification when something you're tracking comes out.
- **Title details.** Open any title to see its description, genres, release year, creators and, where it has one, the series it belongs to.
- **Friends by invite link.** There's no public directory or user search. You share your personal invite link, and the person who opens it confirms before you become friends. You can reset your link or remove a friend at any time.
- **Recommendations.** Recommend a title to a friend, and see what friends have recommended to you, with a notification when one arrives. Titles already on your list are marked as added.
- **Lists and picks.** Make named lists with a note on each title for friends to browse. Your "My picks" list is what you'd recommend to all of them, and shows up on their Recommendations page.
- **Popular with friends.** Before you search, see what's on your friends' lists that isn't on yours, most shared first.
- **Profile photos.** Upload one and position it in the circle.

## Stack

- `client/`: Vite + React + TypeScript, React Router, `@supabase/supabase-js` for auth
- `server/`: Express + TypeScript API, Prisma ORM
- Auth + database: [Supabase](https://supabase.com) (magic-link email and Google sign-in, hosted Postgres)
- Media data: [TMDB](https://www.themoviedb.org/documentation/api) (movies/TV), [Open Library](https://openlibrary.org/developers/api) (books), [RAWG](https://rawg.io/apidocs) (games)
- Hosting: [Vercel](https://vercel.com). The static client and the API are served from one project, with functions in Sydney next to the database.

## Notes

- The API never stores a password. It verifies the Supabase-issued JWT on every request.
- TMDB and RAWG API keys stay server-side. Apart from signing in, the client only talks to our own API.
- Searches go straight to the media providers and are never stored. A title is saved to the database only when someone first adds or recommends it, using details fetched from the provider rather than trusting what the client sends.
- `pnpm audit` currently flags a high-severity advisory in a transitive dependency of the `prisma` CLI (`deepmerge-ts`, via `@prisma/config`). It's a dev-only build tool, not part of the running server, and the fix requires a Prisma major-version bump. It's worth revisiting later but isn't urgent.
