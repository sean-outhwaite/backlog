import { readFile } from 'node:fs/promises'

export interface LinkPreview {
  title: string
  description: string
  // Defaults to index.html's own og:image (the site banner).
  image?: string
  // 'summary' shows the image as a small thumbnail beside the text (right for avatars),
  // 'summary_large_image' as a banner under it.
  card: 'summary' | 'summary_large_image'
}

// The built client page. On Vercel it's bundled into the function by `includeFiles` in vercel.json,
// keeping the same layout relative to server/dist. Read once per process.
const INDEX_HTML = new URL('../../../client/dist/index.html', import.meta.url)
let indexHtml: Promise<string> | null = null

// `origin` is where the same page is served statically, for if the bundled copy is missing (every
// invite link would otherwise fail). Only pass a trusted one: the page's own origin on Vercel.
export function readIndexHtml(origin?: string): Promise<string> {
  if (!indexHtml) {
    indexHtml = readFile(INDEX_HTML, 'utf8')
      .catch(async (error) => {
        if (!origin) throw error
        console.error('Bundled index.html is missing; fetching it instead', error)
        const response = await fetch(`${origin}/index.html`)
        if (!response.ok) throw new Error(`Fetching ${origin}/index.html failed: ${response.status}`)
        return response.text()
      })
      .catch((error) => {
        indexHtml = null
        throw error
      })
  }
  return indexHtml
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Link previewers (Discord, iMessage, Slack) don't run scripts, so they only see the page's own
// meta tags. Swaps index.html's generic ones (title, description, og:*, twitter:*) for these.
export function withLinkPreview(html: string, preview: LinkPreview) {
  const title = escapeHtml(preview.title)
  const description = escapeHtml(preview.description)
  const image = preview.image ? escapeHtml(preview.image) : html.match(/<meta property="og:image" content="([^"]*)"/)?.[1]
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:site_name" content="Backlog" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    image && `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="${preview.card}" />`,
  ].filter(Boolean)
  return html
    .replace(/\s*<title>[^<]*<\/title>/, '')
    .replace(/\s*<meta (?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>/g, '')
    .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
}
