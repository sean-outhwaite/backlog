import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatReleaseDate } from '../lib/release'
import type { Episode, ListEntry, ListStatus, TrackingMode, TvSeason, TvSeasons as TvSeasonsData } from '../types'
import { haptic } from '../lib/haptics'
import { CoverArt } from './CoverArt'
import { CheckIcon, PlayIcon } from './icons'
import { Spinner } from './Spinner'
import { HapticSwitch } from './HapticSwitch'

const MODES: { mode: TrackingMode; label: string }[] = [
  { mode: 'show', label: 'Whole show' },
  { mode: 'season', label: 'By season' },
  { mode: 'episode', label: 'By episode' },
]

const STATUS_LABELS: Record<ListStatus, string> = { want: 'Not watched', in_progress: 'Watching', done: 'Watched' }

// Where the user is up to: the first season that's out and not done, or the last one out once they all are.
function nextUpNumber(seasons: TvSeason[]) {
  const next = seasons.find((season) => season.out && season.status !== 'done')
  return (next ?? seasons.findLast((season) => season.out) ?? seasons[0])?.number ?? null
}

// The episodes of a season counted as watched: all of a done one's that have aired, else those ticked.
function watchedEpisodes(season: TvSeason): number[] {
  if (season.status === 'done') return Array.from({ length: season.airedEpisodes }, (_, i) => i + 1)
  return season.episodes
}

// A season's status from the episodes watched, as the server works it out (seasonStatusFromEpisodes).
function statusFromEpisodes(episodes: number[], episodeCount: number): ListStatus {
  if (episodes.length === 0) return 'want'
  return episodeCount > 0 && episodes.length >= episodeCount ? 'done' : 'in_progress'
}

// A TV show entry's tracking mode, and (by season or episode) its seasons: a grid to pick one
// from, and a panel for the picked one with its status, or its episodes to tick off. Like
// SeriesVolumes, changes can move the entry to another tab, so onChanged only fires once it closes.
export function TvSeasons({ entry, onChanged }: { entry: ListEntry; onChanged: () => void }) {
  const [data, setData] = useState<TvSeasonsData | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)
  const changed = useRef(false)
  // Saves run one at a time, so quick changes land in the order they were made.
  const saving = useRef(Promise.resolve())
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  })

  useEffect(() => {
    let cancelled = false
    api
      .get<TvSeasonsData>(`/api/lists/${entry.id}/seasons`)
      .then((found) => {
        if (cancelled) return
        setData(found)
        setSelected((current) => current ?? nextUpNumber(found.seasons))
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [entry.id, reloads])

  useEffect(
    () => () => {
      if (changed.current) onChangedRef.current()
    },
    [],
  )

  // Applies a change straight away, then saves it, putting the seasons back if the save fails.
  async function save(update: (prev: TvSeason[]) => TvSeason[], request: () => Promise<unknown>) {
    const before = data
    setData((prev) => (prev ? { ...prev, seasons: update(prev.seasons) } : prev))
    saving.current = saving.current.then(async () => {
      try {
        await request()
        changed.current = true
      } catch {
        setData(before)
      }
    })
    await saving.current
  }

  function setTracking(tracking: TrackingMode) {
    haptic()
    setData((prev) => (prev ? { ...prev, tracking } : prev))
    saving.current = saving.current.then(async () => {
      try {
        await api.patch(`/api/lists/${entry.id}`, { tracking })
        changed.current = true
        // Switching a finished show to season or episode tracking marks its seasons watched.
        setReloads((n) => n + 1)
      } catch {
        setReloads((n) => n + 1)
      }
    })
  }

  function setStatus(season: TvSeason, status: ListStatus) {
    haptic()
    return save(
      (prev) => prev.map((s) => (s.number === season.number ? { ...s, status, episodes: [] } : s)),
      () => api.put(`/api/lists/${entry.id}/seasons/${season.number}`, { status }),
    )
  }

  function setEpisodes(season: TvSeason, episodes: number[]) {
    haptic()
    const sorted = [...new Set(episodes)].sort((a, b) => a - b)
    const status = statusFromEpisodes(sorted, season.episodeCount)
    return save(
      (prev) => prev.map((s) => (s.number === season.number ? { ...s, status, episodes: sorted } : s)),
      () => api.put(`/api/lists/${entry.id}/seasons/${season.number}`, { episodes: sorted }),
    )
  }

  function markEarlierDone(season: TvSeason) {
    haptic()
    return save(
      (prev) => prev.map((s) => (s.number < season.number && s.out ? { ...s, status: 'done' } : s)),
      () => api.post(`/api/lists/${entry.id}/seasons/${season.number}/done-before`, {}),
    )
  }

  if (failed) return <p className="error-text">Couldn't load the seasons right now.</p>
  if (!data) {
    return (
      <p className="details-loading" role="status">
        <Spinner /> Loading seasons…
      </p>
    )
  }

  const { tracking, seasons } = data
  const out = seasons.filter((season) => season.out)
  const coming = seasons.find((season) => !season.out)
  const done = out.filter((season) => season.status === 'done').length
  const next = out.find((season) => season.status !== 'done')
  const current = seasons.find((season) => season.number === selected)

  return (
    <section className="series-volumes tv-seasons" aria-label="Seasons">
      <div className="tv-tracking">
        <span>Track</span>
        <div className="volume-status" role="group" aria-label="Track by">
          {MODES.map(({ mode, label }) => (
            <button
              key={mode}
              className={tracking === mode ? 'active' : ''}
              aria-pressed={tracking === mode}
              onClick={() => tracking !== mode && setTracking(mode)}
            >
              {label}
              {tracking !== mode && <HapticSwitch />}
            </button>
          ))}
        </div>
      </div>

      {tracking === 'show' || !tracking ? (
        <p className="volume-panel-upcoming">
          You'll get a notification when a new season comes out
          {coming?.airDate ? ` (season ${coming.number} is due ${formatReleaseDate(coming.airDate)})` : ''}.
        </p>
      ) : seasons.length === 0 ? (
        <p className="volume-panel-upcoming">TMDB doesn't list any seasons for this show yet.</p>
      ) : (
        <>
          {current && (
            <SeasonPanel
              key={current.number}
              season={current}
              externalId={entry.mediaItem.externalId}
              tracking={tracking}
              isNextUp={current.number === next?.number}
              hasEarlierUndone={out.some((s) => s.number < current.number && s.status !== 'done')}
              onStatus={(status) => void setStatus(current, status)}
              onEpisodes={(episodes) => void setEpisodes(current, episodes)}
              onMarkEarlierDone={() => void markEarlierDone(current)}
            />
          )}

          <div className="series-volumes-header">
            <h3>Seasons</h3>
            <span>
              {done} of {out.length} watched
              {next && done > 0 && <> · next up season {next.number}</>}
              {coming && (
                <>
                  {' '}
                  · season {coming.number} {coming.airDate ? `out ${formatReleaseDate(coming.airDate)}` : 'announced'}
                </>
              )}
            </span>
          </div>
          <ol className="series-volumes-grid">
            {seasons.map((season) => {
              const state = season.out
                ? STATUS_LABELS[season.status].toLowerCase()
                : `out ${season.airDate ? formatReleaseDate(season.airDate) : 'soon'}`
              return (
                <li key={season.number}>
                  <button
                    className={`series-volume series-volume--${season.out ? season.status : 'upcoming'}${season.number === selected ? ' is-selected' : ''}`}
                    onClick={() => setSelected(season.number)}
                    aria-pressed={season.number === selected}
                    aria-label={`${season.name}: ${state}`}
                    title={`${season.name}: ${state}`}
                  >
                    <span className="series-volume-cover">
                      <CoverArt media={{ type: 'tv', title: season.name, coverImageUrl: season.coverImageUrl }} />
                      {season.status !== 'want' && (
                        <span className="series-volume-mark">
                          {season.status === 'done' ? <CheckIcon /> : <PlayIcon />}
                        </span>
                      )}
                    </span>
                    <span className="series-volume-label">{season.number}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

// The selected season: its cover and name, with its status (tracking by season) or its episodes
// to tick off (by episode), and the catch-up shortcut.
function SeasonPanel({
  season,
  externalId,
  tracking,
  isNextUp,
  hasEarlierUndone,
  onStatus,
  onEpisodes,
  onMarkEarlierDone,
}: {
  season: TvSeason
  externalId: string
  tracking: 'season' | 'episode'
  isNextUp: boolean
  hasEarlierUndone: boolean
  onStatus: (status: ListStatus) => void
  onEpisodes: (episodes: number[]) => void
  onMarkEarlierDone: () => void
}) {
  const year = season.airDate?.slice(0, 4)
  return (
    <div className="volume-panel">
      <div className="volume-panel-cover">
        <CoverArt media={{ type: 'tv', title: season.name, coverImageUrl: season.coverImageUrl }} />
      </div>
      <div className="volume-panel-info">
        <p className="volume-panel-kicker">
          {isNextUp && <strong>Next up · </strong>}
          {season.episodeCount > 0 && <>{season.episodeCount} episodes · </>}
          {season.out ? year : `out ${season.airDate ? formatReleaseDate(season.airDate) : 'soon'}`}
        </p>
        <h4>{season.name}</h4>

        {!season.out ? (
          <p className="volume-panel-upcoming">Not out yet. You'll get a notification when it is.</p>
        ) : tracking === 'season' ? (
          <div className="volume-status" role="group" aria-label="Status">
            {(['want', 'in_progress', 'done'] as const).map((status) => (
              <button
                key={status}
                className={season.status === status ? 'active' : ''}
                aria-pressed={season.status === status}
                onClick={() => season.status !== status && onStatus(status)}
              >
                {STATUS_LABELS[status]}
                {season.status !== status && <HapticSwitch />}
              </button>
            ))}
          </div>
        ) : (
          <EpisodeList season={season} externalId={externalId} onEpisodes={onEpisodes} onStatus={onStatus} />
        )}

        {hasEarlierUndone && (
          <button className="btn-quiet volume-panel-catch-up" onClick={onMarkEarlierDone}>
            <CheckIcon /> Mark earlier seasons watched
            <HapticSwitch />
          </button>
        )}
      </div>
    </div>
  )
}

// A season's episodes (fetched live), each ticked off on its own, with "up to here" for catching up.
function EpisodeList({
  season,
  externalId,
  onEpisodes,
  onStatus,
}: {
  season: TvSeason
  externalId: string
  onEpisodes: (episodes: number[]) => void
  onStatus: (status: ListStatus) => void
}) {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get<Episode[]>(`/api/media/tv/${externalId}/seasons/${season.number}`)
      .then((found) => !cancelled && setEpisodes(found))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [externalId, season.number])

  const watched = new Set(watchedEpisodes(season))
  const aired = (n: number) => n <= season.airedEpisodes
  const toggle = (n: number) =>
    onEpisodes(watched.has(n) ? [...watched].filter((e) => e !== n) : [...watched, n])
  const upTo = (n: number) =>
    onEpisodes([...watched, ...Array.from({ length: n }, (_, i) => i + 1)])

  if (failed) return <p className="error-text">Couldn't load the episodes right now.</p>
  if (!episodes) {
    return (
      <p className="details-loading" role="status">
        <Spinner /> Loading episodes…
      </p>
    )
  }

  return (
    <>
      <ol className="episode-list">
        {episodes.map((episode) => {
          const isWatched = watched.has(episode.number)
          const isAired = aired(episode.number)
          const behind = !isWatched && isAired && episode.number > 1 && !watched.has(episode.number - 1)
          return (
            <li key={episode.number} className={isWatched ? 'is-watched' : ''}>
              <button
                className="episode-toggle"
                onClick={() => toggle(episode.number)}
                disabled={!isAired}
                aria-pressed={isWatched}
              >
                <span className="episode-check" aria-hidden="true">
                  {isWatched && <CheckIcon />}
                </span>
                <span className="episode-number">E{episode.number}</span>
                <span className="episode-name">{episode.name}</span>
                {!isAired && (
                  <span className="episode-date">
                    {episode.airDate ? formatReleaseDate(episode.airDate) : 'TBA'}
                  </span>
                )}
                {isAired && <HapticSwitch />}
              </button>
              {behind && (
                <button className="btn-quiet episode-up-to" onClick={() => upTo(episode.number)}>
                  Up to here
                  <HapticSwitch />
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {season.status !== 'done' && season.airedEpisodes >= season.episodeCount && (
        <button className="btn-quiet volume-panel-catch-up" onClick={() => onStatus('done')}>
          <CheckIcon /> Mark season watched
          <HapticSwitch />
        </button>
      )}
    </>
  )
}
