import { afterEach, describe, expect, it, vi } from 'vitest'

const readFile = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', () => ({ readFile }))

const { withLinkPreview } = await import('./linkPreview.js')

// A fresh copy each time, since the module keeps the page it read.
async function freshReadIndexHtml() {
  vi.resetModules()
  return (await import('./linkPreview.js')).readIndexHtml
}

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

describe('readIndexHtml', () => {
  afterEach(() => {
    readFile.mockReset()
    vi.unstubAllGlobals()
  })

  it('reads the bundled page once and keeps it', async () => {
    readFile.mockResolvedValue('<html>bundled</html>')
    const readIndexHtml = await freshReadIndexHtml()
    expect(await readIndexHtml()).toBe('<html>bundled</html>')
    expect(await readIndexHtml()).toBe('<html>bundled</html>')
    expect(readFile).toHaveBeenCalledTimes(1)
  })

  it('fetches the static page when the bundled one is missing', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    const fetch = vi.fn().mockResolvedValue(new Response('<html>static</html>'))
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const readIndexHtml = await freshReadIndexHtml()
    expect(await readIndexHtml('https://backlog.example')).toBe('<html>static</html>')
    expect(fetch).toHaveBeenCalledWith('https://backlog.example/index.html')
  })

  it("fails without an origin, and tries again next time rather than keeping the failure", async () => {
    readFile.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValue('<html>bundled</html>')
    const readIndexHtml = await freshReadIndexHtml()
    await expect(readIndexHtml()).rejects.toThrow('ENOENT')
    expect(await readIndexHtml()).toBe('<html>bundled</html>')
  })

  it('fails when the static page errors too', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const readIndexHtml = await freshReadIndexHtml()
    await expect(readIndexHtml('https://backlog.example')).rejects.toThrow('404')
  })
})
