import { createApp } from 'fondu'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const app = createApp()
const ORIGIN = 'http://localhost'
const navigation = { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' }
let log: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  log = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('a redirect to a script URL', () => {
  test.each([
    ['javascript:', '/redirect?script=1', 'GET'],
    ['javascript:', '/redirect?script', 'POST'],
    ['data:', '/redirect?data', 'POST'],
    ['vbscript:', '/redirect?vbscript', 'POST'],
    ['javascript:', '/redirect?padded', 'POST'],
  ])('%s %s: 500 for a navigation and a document', async (scheme, url, method) => {
    for (const headers of [navigation, { Accept: 'text/html' }, {}] as Record<string, string>[]) {
      log.mockClear()
      const res = await app.request(url, { method, headers: { Origin: ORIGIN, ...headers } })
      expect([res.status, res.headers.get('location')], JSON.stringify(headers)).toEqual([
        500,
        null,
      ])
      expect(String(log.mock.calls[0]?.[0])).toContain(
        `fondu: a redirect to "${scheme}" is refused`,
      )
    }
  })

  test.each([
    ['myapp://callback?code=1', '/redirect?app'],
    ['mailto:a@b.c', '/redirect?mail'],
  ])('a redirect to %s passes through, for a navigation and a document', async (to, url) => {
    for (const headers of [navigation, { Accept: 'text/html' }] as Record<string, string>[]) {
      const res = await app.request(url, {
        method: 'POST',
        headers: { Origin: ORIGIN, ...headers },
      })
      expect([res.status, res.headers.get('location')], JSON.stringify(headers)).toEqual([303, to])
    }
    expect(log).not.toHaveBeenCalled()
  })

  test('a redirect to a relative, an absolute http(s) or a #fragment URL is as before', async () => {
    const post = (url: string, headers: Record<string, string>) =>
      app.request(url, { method: 'POST', headers: { Origin: ORIGIN, ...headers } })
    const home = await post('/redirect?home', {})
    expect([home.status, home.headers.get('location')]).toEqual([303, '/'])
    const relative = await post('/redirect?relative', {})
    expect([relative.status, relative.headers.get('location')]).toEqual([303, 'notes?a=1#end'])
    const away = await post('/redirect?away', {})
    expect([away.status, away.headers.get('location')]).toEqual([303, 'https://example.com/'])
    expect((await post('/redirect?away', navigation)).status).toBe(409)
    const fragment = await post('/redirect?fragment', navigation)
    expect(fragment.headers.get('x-fondu-redirect')).toBe('/notes#end')
    expect(log).not.toHaveBeenCalled()
  })
})
