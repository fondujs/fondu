import { createApp } from 'fondu'
import { describe, expect, test } from 'vitest'

const app = createApp()
const html = { Accept: 'text/html' }
const post = (headers: Record<string, string>, body = 'name=a') =>
  app.request('/items', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  })
const vary = (res: Response) => (res.headers.get('Vary') ?? '').split(/\s*,\s*/)

describe('Vary: Accept', () => {
  test('a 404, for a page and for an API client', async () => {
    expect(vary(await app.request('/nowhere', { headers: html }))).toContain('Accept')
    expect(vary(await app.request('/nowhere'))).toContain('Accept')
  })

  test('a 500', async () => {
    const error = console.error
    console.error = () => {}
    try {
      for (const headers of [html, {}]) {
        const res = await app.request('/boom', { headers })
        expect(res.status).toBe(500)
        expect(vary(res)).toContain('Accept')
      }
    } finally {
      console.error = error
    }
  })

  test('a 405 and a validation failure, each way', async () => {
    expect(
      vary(
        await app.request('/methods', {
          method: 'DELETE',
          headers: { Origin: 'http://localhost' },
        }),
      ),
    ).toContain('Accept')
    expect(vary(await post(html))).toContain('Accept')
    expect(vary(await post({}))).toContain('Accept')
    expect(vary(await app.request('/search?q=a', { headers: html }))).toContain('Accept')
  })

  test('appended: what the response had stays, X-Fondu once', async () => {
    const res = await app.request('/nowhere', { headers: html })
    expect(vary(res)).toEqual(expect.arrayContaining(['Accept', 'X-Fondu']))
    expect(vary(res).filter((v) => v === 'Accept')).toHaveLength(1)
  })
})

describe('an invalid query of a GET is a 422', () => {
  test('a browser: the error page, no redirect', async () => {
    const res = await app.request('/search?q=a', { headers: html })
    expect(res.status).toBe(422)
    expect(res.headers.get('Location')).toBeNull()
    expect(await res.text()).toContain('"status":422')
  })

  test('a navigation: the error page as JSON', async () => {
    const res = await app.request('/search?q=a', {
      headers: {
        ...html,
        'X-Fondu': 'true',
        'X-Fondu-Version': 'v1',
        Referer: 'http://localhost/',
      },
    })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ component: '_error', props: { status: 422 } })
  })

  test('HEAD too, and an API client gets { errors }', async () => {
    expect((await app.request('/search?q=a', { method: 'HEAD', headers: html })).status).toBe(422)
    const res = await app.request('/search?q=a')
    expect([res.status, await res.json()]).toEqual([422, { errors: { q: 'Too short' } }])
  })

  test('a valid query answers', async () => {
    expect(await (await app.request('/search?q=ab', { headers: html })).json()).toEqual({ q: 'ab' })
  })

  test('a browser POST with a bad body is a 303 back, as before', async () => {
    const res = await post({ ...html, Referer: 'http://localhost/form' })
    expect([res.status, res.headers.get('Location')]).toEqual([303, '/form'])
  })
})
