// Builds (or rebuilds) the read-only demo: the shared demo account plus three sample friends, with
// lists, progress, picks, recommendations and a notification. See src/lib/demo.ts for how the demo
// is kept read-only.
//
//   pnpm exec tsx scripts/seedDemo.ts            (from server/, with the API running: pnpm dev)
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env, and talks to the API at
// API_BASE (default http://localhost:4000), which uses the one live database.
//
// Everything goes through the app's own endpoints, signed in as each account, so series volumes,
// TV seasons and notifications come out exactly as real use makes them. The accounts stay flagged
// as demo throughout (clearing the flag would let a visitor refresh into a writable token); the
// API takes these writes because each request carries DEMO_SEED_SECRET, which the local server
// honours and Vercel never does. Re-running first deletes everything these four accounts own, and
// only that.

import 'dotenv/config'
import { prisma } from '../src/lib/prisma.js'
import { DEMO_EMAIL, DEMO_SEED_HEADER } from '../src/lib/demo.js'

const SUPABASE_URL = required('SUPABASE_URL')
const SERVICE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const API_BASE = process.env.API_BASE ?? 'http://localhost:4000'
// Must match the API server's (both read server/.env). See isDemoSeedRequest in src/lib/demo.ts.
const SEED_SECRET = required('DEMO_SEED_SECRET')

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

type MediaType = 'movie' | 'tv' | 'book' | 'game'
type Status = 'want' | 'in_progress' | 'done'

interface Account {
  key: 'demo' | 'maya' | 'sam' | 'jordan'
  email: string
  username: string
  id?: string
  token?: string
}

const ACCOUNTS: Account[] = [
  { key: 'demo', email: DEMO_EMAIL, username: 'demo' },
  { key: 'maya', email: 'demo-maya@backlog.outh.nz', username: 'maya' },
  { key: 'sam', email: 'demo-sam@backlog.outh.nz', username: 'sam' },
  { key: 'jordan', email: 'demo-jordan@backlog.outh.nz', username: 'jordan' },
]

// ---------- Supabase admin ----------

const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

async function auth(path: string, init: RequestInit) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, { ...init, headers: adminHeaders })
  const body = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, body }
}

// Creates the account if it's new (already confirmed, so it can be signed into without email).
async function ensureUser(account: Account) {
  const created = await auth('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: account.email, email_confirm: true, app_metadata: { demo: true } }),
  })
  if (!created.ok && created.status !== 422) throw new Error(`Creating ${account.email}: ${JSON.stringify(created.body)}`)
}

// generate_link sends nothing; its token is exchanged for a session straight away.
async function signIn(account: Account) {
  const link = await auth('/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email: account.email }),
  })
  if (!link.ok) throw new Error(`generate_link for ${account.email}: ${JSON.stringify(link.body)}`)
  const hashedToken = link.body.properties?.hashed_token ?? link.body.hashed_token
  account.id = link.body.user?.id ?? link.body.id
  const session = await auth('/verify', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', token_hash: hashedToken }),
  })
  if (!session.ok || !session.body.access_token) {
    throw new Error(`Signing in ${account.email}: ${JSON.stringify(session.body)}`)
  }
  account.token = session.body.access_token
}

async function setDemoFlag(account: Account, demo: boolean) {
  const updated = await auth(`/admin/users/${account.id}`, {
    method: 'PUT',
    body: JSON.stringify({ app_metadata: { demo } }),
  })
  if (!updated.ok) throw new Error(`Flagging ${account.email}: ${JSON.stringify(updated.body)}`)
}

// ---------- Our API ----------

async function api<T>(account: Account, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${account.token}`,
      'Content-Type': 'application/json',
      [DEMO_SEED_HEADER]: SEED_SECRET,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path} as ${account.username}: ${response.status} ${await response.text()}`)
  return (response.status === 204 ? undefined : await response.json()) as T
}

interface SearchResult {
  type: MediaType
  externalId: string
  title: string
  releaseYear: number | null
  kind?: 'series'
  series?: { externalId: string; title: string }
}

const normalize = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const found = new Map<string, SearchResult>()

// A title by name, checked against the year where given, so a remake or namesake can't slip in.
async function find(searcher: Account, type: MediaType, title: string, year?: number): Promise<SearchResult> {
  const key = `${type}:${title}:${year ?? ''}`
  const cached = found.get(key)
  if (cached) return cached
  const results = await api<SearchResult[]>(
    searcher,
    'GET',
    `/api/media/search?type=${type}&q=${encodeURIComponent(title)}`,
  )
  const match = results.find(
    (result) =>
      result.type === type &&
      result.kind !== 'series' &&
      normalize(result.title) === normalize(title) &&
      (year === undefined || result.releaseYear === year),
  )
  if (!match) {
    const seen = results.slice(0, 5).map((result) => `${result.title} (${result.releaseYear})`)
    throw new Error(`No ${type} "${title}"${year ? ` (${year})` : ''}. Top results: ${seen.join('; ')}`)
  }
  found.set(key, match)
  return match
}

const ref = (result: SearchResult) => ({ type: result.type, externalId: result.externalId })

interface Entry {
  id: string
  mediaItemId: string
}

async function add(account: Account, type: MediaType, title: string, status: Status, year?: number) {
  const result = await find(account, type, title, year)
  return api<Entry>(account, 'POST', '/api/lists', { ...ref(result), status })
}

// ---------- Content ----------

type Item = [MediaType, string, Status, number?]

// The demo's own list: a bit of everything, in every state, including a show and a book series
// part way through and a game that isn't out yet (the Preorders tab). Added oldest first, since
// new entries go on top.
const DEMO_LIST: Item[] = [
  ['movie', 'Arrival', 'done', 2016],
  ['movie', 'Spirited Away', 'done', 2001],
  ['movie', 'Mad Max: Fury Road', 'done', 2015],
  ['game', 'Return of the Obra Dinn', 'done', 2018],
  ['game', 'Hades', 'done', 2020],
  ['book', 'Station Eleven', 'done'],
  ['book', 'Piranesi', 'done'],
  ['tv', 'Severance', 'want'],
  ['tv', 'The Bear', 'want'],
  ['movie', 'Perfect Days', 'want', 2023],
  ['movie', 'Past Lives', 'want', 2023],
  ['book', 'Project Hail Mary', 'want'],
  ['book', 'The Left Hand of Darkness', 'want'],
  ['game', 'Hollow Knight: Silksong', 'want'],
  ['game', 'The Witcher IV', 'want'],
  ['game', 'Outer Wilds', 'in_progress', 2019],
  ['tv', 'Delicious in Dungeon', 'want'],
  ['tv', 'Better Call Saul', 'want'],
]

const FRIEND_LISTS: Record<'maya' | 'sam' | 'jordan', Item[]> = {
  maya: [
    ['game', 'Disco Elysium', 'done', 2019],
    ['game', 'Outer Wilds', 'done', 2019],
    ['game', 'Celeste', 'done', 2018],
    ['book', 'Piranesi', 'done'],
    ['book', 'The Left Hand of Darkness', 'in_progress'],
    ['game', 'Hollow Knight: Silksong', 'in_progress'],
    ['tv', 'Delicious in Dungeon', 'want'],
  ],
  sam: [
    ['tv', 'Andor', 'done'],
    ['tv', 'Better Call Saul', 'done'],
    ['movie', 'Arrival', 'done', 2016],
    ['movie', 'Past Lives', 'done', 2023],
    ['tv', 'Severance', 'in_progress'],
    ['movie', 'Perfect Days', 'want', 2023],
  ],
  jordan: [
    ['book', 'Project Hail Mary', 'done'],
    ['book', 'Tress of the Emerald Sea', 'done'],
    ['game', 'Hades', 'done', 2020],
    ['movie', 'Spirited Away', 'done', 2001],
    ['tv', 'The Bear', 'in_progress'],
  ],
}

const FRIEND_PICKS: Record<'maya' | 'sam' | 'jordan', [MediaType, string, number?][]> = {
  maya: [
    ['game', 'Disco Elysium', 2019],
    ['game', 'Celeste', 2018],
    ['book', 'Piranesi'],
  ],
  sam: [
    ['tv', 'Andor'],
    ['movie', 'Past Lives', 2023],
    ['tv', 'Better Call Saul'],
  ],
  jordan: [
    ['book', 'Tress of the Emerald Sea'],
    ['game', 'Hades', 2020],
  ],
}

// ---------- Steps ----------

async function clearAccounts(ids: string[]) {
  const mine = { in: ids }
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { OR: [{ userId: mine }, { actorId: mine }] } }),
    prisma.recommendation.deleteMany({ where: { OR: [{ fromUserId: mine }, { toUserId: mine }] } }),
    prisma.friendship.deleteMany({ where: { OR: [{ userAId: mine }, { userBId: mine }] } }),
    prisma.inviteLink.deleteMany({ where: { ownerId: mine } }),
    // Their items and progress rows go with them (onDelete: Cascade).
    prisma.collection.deleteMany({ where: { ownerId: mine } }),
    prisma.listEntry.deleteMany({ where: { userId: mine } }),
    prisma.pushSubscription.deleteMany({ where: { userId: mine } }),
  ])
}

// A show some seasons in: the entry moves to In progress with them.
async function seedShow(demo: Account, title: string, seasonsDone: number) {
  const entry = await add(demo, 'tv', title, 'want')
  await api(demo, 'GET', `/api/lists/${entry.id}/seasons`)
  for (let season = 1; season <= seasonsDone; season++) {
    await api(demo, 'PUT', `/api/lists/${entry.id}/seasons/${season}`, { status: 'done' })
  }
}

// Discworld, twelve novels read and the thirteenth started.
async function seedSeries(demo: Account) {
  const first = await find(demo, 'book', 'The Colour of Magic')
  if (!first.series) throw new Error('The Colour of Magic came back without its series')
  const entry = await api<Entry>(demo, 'POST', '/api/lists', {
    type: 'book',
    externalId: first.series.externalId,
    kind: 'series',
    status: 'want',
  })
  const volumes = await api<{ id: string; status: Status }[]>(demo, 'GET', `/api/lists/${entry.id}/volumes`)
  const current = volumes[12]
  if (!current) throw new Error(`Discworld has only ${volumes.length} volumes`)
  await api(demo, 'POST', `/api/lists/${entry.id}/volumes/${current.id}/done-before`)
  await api(demo, 'PUT', `/api/lists/${entry.id}/volumes/${current.id}`, { status: 'in_progress' })
}

async function main() {
  const accounts = Object.fromEntries(ACCOUNTS.map((account) => [account.key, account])) as Record<
    Account['key'],
    Account
  >
  const { demo, maya, sam, jordan } = accounts
  const friends = [maya, sam, jordan]

  console.log('Accounts…')
  for (const account of ACCOUNTS) {
    await ensureUser(account)
    await signIn(account)
    // Already set for accounts this script made; this covers any made before the flag existed.
    await setDemoFlag(account, true)
  }

  console.log('Clearing old demo data…')
  await clearAccounts(ACCOUNTS.map((account) => account.id!))

  for (const account of ACCOUNTS) {
    await api(account, 'PATCH', '/api/profile/me', { username: account.username })
  }

  console.log('Friends…')
  for (const friend of friends) {
    const invite = await api<{ token: string }>(friend, 'GET', '/api/invites/mine')
    await api(demo, 'POST', `/api/invites/${invite.token}/redeem`)
  }
  // Nothing should lead back to these accounts: the links were only needed to make the friendships.
  await prisma.inviteLink.deleteMany({ where: { ownerId: { in: friends.map((friend) => friend.id!) } } })

  console.log("Friends' lists…")
  for (const friend of friends) {
    for (const [type, title, status, year] of FRIEND_LISTS[friend.key as keyof typeof FRIEND_LISTS]) {
      await add(friend, type, title, status, year)
    }
    for (const [type, title, year] of FRIEND_PICKS[friend.key as keyof typeof FRIEND_PICKS]) {
      await api(friend, 'POST', '/api/collections/picks/items', ref(await find(friend, type, title, year)))
    }
  }

  console.log("The demo's list…")
  for (const [type, title, status, year] of DEMO_LIST) {
    if (title === 'Better Call Saul') await seedShow(demo, title, 4)
    else await add(demo, type, title, status, year)
  }
  await seedSeries(demo)

  console.log("The demo's lists…")
  for (const [type, title, year] of [
    ['game', 'Outer Wilds', 2019],
    ['movie', 'Spirited Away', 2001],
    ['book', 'Piranesi', undefined],
  ] as const) {
    await api(demo, 'POST', '/api/collections/picks/items', ref(await find(demo, type, title, year)))
  }
  const cozy = await api<{ id: string }>(demo, 'POST', '/api/collections', {
    name: 'Rainy weekend',
    description: 'Short, gentle and best with a blanket.',
  })
  for (const [type, title, year, note] of [
    ['movie', 'Perfect Days', 2023, 'Nothing happens, beautifully.'],
    ['game', 'Return of the Obra Dinn', 2018, undefined],
    ['book', 'Piranesi', undefined, undefined],
    ['movie', 'Spirited Away', 2001, undefined],
  ] as const) {
    await api(demo, 'POST', `/api/collections/${cozy.id}/items`, {
      ...ref(await find(demo, type, title, year)),
      ...(note && { note }),
    })
  }

  console.log('Recommendations…')
  const recommendations: [Account, MediaType, string, string, number?][] = [
    [jordan, 'book', 'Tress of the Emerald Sea', 'Like a Studio Ghibli film in book form.'],
    [sam, 'tv', 'Andor', 'Trust me, even if you don’t care about Star Wars.'],
    [maya, 'game', 'Disco Elysium', 'You’ll love the writing. Talk to your necktie.', 2019],
  ]
  for (const [from, type, title, message, year] of recommendations) {
    await api(from, 'POST', '/api/recommendations', {
      ...ref(await find(from, type, title, year)),
      toUserIds: [demo.id],
      message,
    })
  }

  console.log(`Done. Demo account ${demo.id}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
