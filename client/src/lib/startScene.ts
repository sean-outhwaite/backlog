import type { MediaType } from '../types'

// Starting a title acts it out over its cover: a controller rumbles as its buttons are mashed, a
// book's pages flip, a clapperboard snaps shut, a TV switches on. Each scene is a white line
// drawing on a 100-unit grid, laid over a frosted cover and ended by the same burst of rays.
// Drawn and moved from script, like the Finished pop, so it's free of React's render.

// Face-button colours, bright enough to read over any cover in either theme.
const COLOURS = ['#4ade80', '#f87171', '#60a5fa', '#facc15', '#f472b6', '#fb923c']

// Rays that draw out from the drawing and away, round its middle.
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * 2 * Math.PI + Math.PI / 8
  const [x, y] = [Math.cos(angle), Math.sin(angle)]
  return `<path class="start-scene-ray" pathLength="1" d="M${50 + x * 38} ${55 + y * 38}L${50 + x * 47} ${55 + y * 47}"/>`
}).join('')

const DRAWINGS: Record<MediaType, string> = {
  game: `
    <g class="game">
      <path d="M26 36h48a18 18 0 0 1 18 18v2a14 14 0 0 1-25 8.6L62 58H38l-5 6.6A14 14 0 0 1 8 56v-2a18 18 0 0 1 18-18z"/>
      <path d="M27 44v14M20 51h14"/>
      ${[
        [68, 44.5],
        [75, 51],
        [68, 57.5],
        [61, 51],
      ]
        .map(([cx, cy]) => `<circle class="game-button" cx="${cx}" cy="${cy}" r="3.2" fill="#fff" stroke="none"/>`)
        .join('')}
    </g>`,
  book: `
    <g class="book">
      <path d="M50 32c-10-5-22-5-34-2v44c12-3 24-3 34 2z"/>
      <path d="M50 32c10-5 22-5 34-2v44c-12-3-24-3-34 2z"/>
      <path d="M23 42c6-1.2 13-1.2 20 0M23 50c6-1.2 13-1.2 20 0M23 58c6-1.2 13-1.2 20 0M57 42c7-1.2 14-1.2 20 0M57 50c7-1.2 14-1.2 20 0M57 58c7-1.2 14-1.2 20 0" stroke-width="2"/>
      ${'<path class="book-page" d="M50 32c10-5 22-5 34-2v44c-12-3-24-3-34 2z"/>'.repeat(3)}
    </g>`,
  movie: `
    <g class="clapper">
      <rect x="18" y="44" width="64" height="38" rx="3"/>
      <path d="M18 54h64M30 62h40M30 71h26" stroke-width="2.5"/>
      <g class="clapper-stick">
        <rect x="18" y="33" width="64" height="11" rx="2"/>
        <path d="M34 33l-6 11M48 33l-6 11M62 33l-6 11M76 33l-6 11"/>
      </g>
    </g>`,
  tv: `
    <g class="tv">
      <g class="tv-antenna"><path d="M37 20l13 14 13-14"/><circle cx="37" cy="20" r="2" fill="#fff"/><circle cx="63" cy="20" r="2" fill="#fff"/></g>
      <g class="tv-bars" stroke="none">
        ${COLOURS.map((fill, i) => `<rect x="${21 + i * 9.67}" y="41" width="9.67" height="36" fill="${fill}"/>`).join('')}
      </g>
      <rect class="tv-glow" x="21" y="41" width="58" height="36" fill="#fff" stroke="none"/>
      <rect x="14" y="34" width="72" height="50" rx="7"/>
    </g>`,
}

const SPRING = 'cubic-bezier(0.3, 1.5, 0.5, 1)'

type Animate = (selector: string, keyframes: Keyframe[], options: KeyframeAnimationOptions) => Animation[]

// Each scene's acting, as animations of its parts; it ends with its drawing still showing.
const ACTS: Record<MediaType, (animate: Animate) => Animation[]> = {
  // Rumbles while the face buttons light up one after another.
  game: (animate) => [
    ...animate(
      '.game',
      [
        { transform: 'none' },
        ...Array.from({ length: 10 }, (_, i) => ({
          transform: `translate(${i % 2 ? 1.6 : -1.6}px, ${i % 3 ? 0.8 : -0.8}px) rotate(${i % 2 ? 3 : -3}deg)`,
        })),
        { transform: 'none' },
      ],
      { duration: 650, delay: 350, easing: 'linear' },
    ),
    ...animate(
      '.game-button',
      [
        { fill: '#fff', transform: 'scale(1)' },
        { fill: 'var(--flash)', transform: 'scale(1.7)', offset: 0.3 },
        { fill: 'var(--flash)', transform: 'scale(1)' },
      ],
      { duration: 380, delay: 350, easing: 'ease-out', fill: 'forwards' },
    ),
  ],
  // Three pages turn over from the right, one after another.
  book: (animate) =>
    animate(
      '.book-page',
      [
        { transform: 'scaleX(1)', fill: 'rgba(255, 255, 255, 0.35)' },
        { transform: 'scaleX(-1)', fill: 'rgba(255, 255, 255, 0.12)' },
      ],
      { duration: 520, delay: 380, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' },
    ),
  // The stick hangs open, then claps shut and the board jolts.
  movie: (animate) => [
    ...animate(
      '.clapper-stick',
      [
        { transform: 'rotate(-28deg)' },
        { transform: 'rotate(-34deg)', offset: 0.6, easing: 'cubic-bezier(0.6, 0, 1, 1)' },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 700, delay: 250, fill: 'backwards' },
    ),
    ...animate('.clapper', [{ transform: 'none' }, { transform: 'translateY(2.5px) scale(1.04)' }, { transform: 'none' }], {
      duration: 260,
      delay: 950,
      easing: 'ease-out',
    }),
  ],
  // The picture opens from a dot to a line to the full screen, as an old set warms up, onto colour bars.
  tv: (animate) => [
    ...animate(
      '.tv-glow',
      [
        { transform: 'scale(0, 0.03)', opacity: 1 },
        { transform: 'scale(1, 0.03)', opacity: 1, offset: 0.35 },
        { transform: 'scale(1, 1)', opacity: 1, offset: 0.65 },
        { transform: 'scale(1, 1)', opacity: 0 },
      ],
      { duration: 900, delay: 300, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' },
    ),
    ...animate('.tv-bars', [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], {
      duration: 900,
      delay: 300,
      fill: 'both',
    }),
    ...animate(
      '.tv-antenna',
      [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(0)' }],
      { duration: 600, delay: 250, easing: 'ease-in-out' },
    ),
  ],
}

// When each scene's climax lands, for the rays to burst on it.
const CLIMAX_MS: Record<MediaType, number> = { game: 850, book: 1100, movie: 950, tv: 1050 }

// Lays the scene over the cover and plays it. Resolves once it has played out, leaving it on the
// cover (the card eases out with it); remove() takes it away, should the move fail.
export function playStartScene(cover: HTMLElement, type: MediaType) {
  const scene = document.createElement('div')
  scene.className = `start-scene start-scene--${type}`
  scene.setAttribute('aria-hidden', 'true')
  scene.innerHTML = `<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><g class="start-scene-drawing">${DRAWINGS[type]}</g>${RAYS}</svg>`
  cover.appendChild(scene)

  const animate: Animate = (selector, keyframes, options) =>
    Array.from(scene.querySelectorAll<SVGElement>(selector), (element, i) => {
      element.style.setProperty('--flash', COLOURS[i % COLOURS.length])
      // Parts that repeat (buttons, pages) take turns.
      const stagger = selector === '.game-button' ? 110 : selector === '.book-page' ? 190 : 0
      return element.animate(keyframes, { ...options, delay: (Number(options.delay) || 0) + i * stagger })
    })

  const animations = [
    scene.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'both' }),
    // The drawing rises into place, springing, then swells a touch at the climax.
    ...animate(
      '.start-scene-drawing',
      [
        { transform: 'translateY(14px) scale(0.6)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 420, easing: SPRING, fill: 'backwards' },
    ),
    ...ACTS[type](animate),
    ...animate(
      '.start-scene-drawing',
      [{ transform: 'none' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'scale(1.05)' }],
      { duration: 360, delay: CLIMAX_MS[type], easing: 'ease-out', fill: 'forwards' },
    ),
    ...animate(
      '.start-scene-ray',
      [
        { strokeDashoffset: 1, opacity: 1 },
        { strokeDashoffset: 0, opacity: 1, offset: 0.5 },
        { strokeDashoffset: -1, opacity: 0 },
      ],
      { duration: 480, delay: CLIMAX_MS[type], easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)', fill: 'both' },
    ),
  ]

  return {
    finished: Promise.all(animations.map((animation) => animation.finished)).then(() => undefined),
    remove: () => scene.remove(),
  }
}
