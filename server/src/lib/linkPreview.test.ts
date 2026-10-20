import { describe, expect, it } from 'vitest'
import { withLinkPreview } from './linkPreview.js'

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Backlog</title>
    <meta name="description" content="Generic description" />
    <meta property="og:title" content="Backlog" />
    <meta property="og:image" content="https://backlog.outh.nz/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body><div id="root"></div></body>
</html>`

describe('withLinkPreview', () => {
  it('replaces the generic tags rather than adding a second set', () => {
    const html = withLinkPreview(INDEX, {
      title: 'Mazuko wants to be friends on Backlog',
      description: 'Join them',
      image: 'https://example.com/avatar.webp',
      card: 'summary',
    })
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/og:title/g)).toHaveLength(1)
    expect(html.match(/og:image/g)).toHaveLength(1)
    expect(html).toContain('<title>Mazuko wants to be friends on Backlog</title>')
    expect(html).toContain('content="https://example.com/avatar.webp"')
    expect(html).toContain('<meta name="twitter:card" content="summary" />')
    expect(html).not.toContain('Generic description')
    expect(html).toContain('<meta charset="UTF-8" />')
  })

  it('keeps the site banner when no image is given', () => {
    const html = withLinkPreview(INDEX, { title: 'Invite', description: 'Join', card: 'summary_large_image' })
    expect(html).toContain('<meta property="og:image" content="https://backlog.outh.nz/og.png" />')
  })

  it('escapes usernames', () => {
    const html = withLinkPreview(INDEX, {
      title: '"><script>alert(1)</script> wants to be friends',
      description: 'Join',
      card: 'summary_large_image',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })
})
