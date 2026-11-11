import { createHash } from 'node:crypto'

import { createApp } from 'fondu'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ownScripts } from '../src/vite/prerender.js'
import { arm, release } from './app/routes/_stream/gate.js'

// the scroll-restoring script of the document before it was streamed (origin/main), as written
const TODAYS_SCRIPT = `try{var k=history.state&&history.state["__fondu"],p=k&&JSON.parse(sessionStorage.getItem("fondu-scroll:"+k));if(p){var go=function(){scrollTo(+p.x||0,+p.y||0)},off=function(){go=0};go();["wheel","touchstart","keydown","mousedown"].forEach(function(t){addEventListener(t,off,{once:!0,passive:!0})});addEventListener("load",function(){setTimeout(function(){go&&go()})})}}catch(e){}`

const app = createApp()
const html = { Accept: 'text/html' }

/** the next chunk of a response's body, as text (`''` when it has ended) */
const reader = (res: Response) => {
  const read = res.body!.getReader()
  const decoder = new TextDecoder()
  return async () => {
    const { done, value } = await read.read()
    return done ? null : decoder.decode(value, { stream: true })
  }
}

afterEach(() => vi.restoreAllMocks())

describe('a streamed document', () => {
  test('the shell and the page data first, the boundary when its data is there', async () => {
    arm()
    const res = await app.request('/stream', { headers: html })
    const next = reader(res)
    const first = (await next())!
    expect(first).toContain('<script data-page="app"')
    expect(first).toContain('<p id="fallback">Loading</p>')
    expect(first).not.toContain('Late content')
    release()
    let rest = ''
    for (let chunk = await next(); chunk !== null; chunk = await next()) rest += chunk
    expect(rest).toContain('<p id="late">Late content</p>')
    expect(rest.endsWith('</body></html>')).toBe(true)
  })
  test("the status and the headers are the loader's, sent with the first byte", async () => {
    arm()
    const res = await app.request('/stream', { headers: html })
    expect([res.status, res.headers.get('content-type')]).toEqual([202, 'text/html; charset=UTF-8'])
    expect(res.headers.get('content-security-policy')).toContain("'nonce-")
    release()
    await res.text()
  })
  test("React's scripts carry the request's nonce; the whole text has the content", async () => {
    arm()
    const res = await app.request('/stream', { headers: html })
    const nonce = /'nonce-([\w+/=]+)'/.exec(res.headers.get('content-security-policy')!)![1]
    setTimeout(release, 20)
    const text = await res.text()
    expect(text).toContain('Late content')
    const scripts = [...text.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1])
    expect(text).toContain('$RC=')
    expect(
      scripts.filter((a) => !a!.includes('data-page')).every((a) => a === ` nonce="${nonce}"`),
    ).toBe(true)
  })
  test("the page's <title> is in the head, before the page data", async () => {
    arm()
    release()
    const text = await (await app.request('/stream', { headers: html })).text()
    expect(text.indexOf('<title>Streamed</title>')).toBeLessThan(text.indexOf('<script data-page'))
    expect(text.indexOf('<title>')).toBeLessThan(text.indexOf('</head>'))
  })
  test('a shell that throws: the page is rendered in the browser, status as it was', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/stream?mode=shell', { headers: html })
    const text = await res.text()
    expect(res.status).toBe(202)
    expect(text).toContain('</script><div id="app"></div></body></html>')
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]![0]).toBe(
      '[fondu] server render of "stream" failed, sending it to render in the browser:',
    )
  })
  test('a boundary that throws after the shell: the stream completes, the status was sent, an error logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    arm()
    const res = await app.request('/stream?mode=boundary', { headers: html })
    const next = reader(res)
    await next()
    release()
    let rest = ''
    for (let chunk = await next(); chunk !== null; chunk = await next()) rest += chunk
    expect(res.status).toBe(202)
    expect(rest).toContain('$RX(')
    expect(rest.endsWith('</body></html>')).toBe(true)
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]![0])).toContain('a Suspense boundary of "stream" failed')
  })
  test('a prerendered page waits for every boundary: no script of React in it', async () => {
    arm()
    setTimeout(release, 20)
    const res = await app.request('/stream', { headers: html }, { FONDU_PRERENDER: '1' })
    const text = await res.text()
    expect(text).toContain('<p id="late">Late content</p>')
    expect(text).not.toContain('Loading')
    expect(text).not.toMatch(/\$R[A-Z]|id="[BS]:/)
  })
  test('HEAD: the headers, no render', async () => {
    const res = await app.request('/stream', { method: 'HEAD', headers: html })
    expect([res.status, await res.text()]).toEqual([202, ''])
  })
  test("a static page's inline script hash is unchanged", async () => {
    const res = await app.request('/', { headers: html }, { FONDU_PRERENDER: '1' })
    const { hashes } = ownScripts(
      await res.text(),
      res.headers.get('content-security-policy') ?? undefined,
    )
    const today = `'sha256-${createHash('sha256').update(TODAYS_SCRIPT).digest('base64')}'`
    expect(hashes).toEqual([today])
  })
})
