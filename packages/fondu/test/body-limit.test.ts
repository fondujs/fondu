import { createApp } from 'fondu'
import { expect, test } from 'vitest'

// The recipe of the forms docs: a limit by path. `bodyLimit: false`, and Hono's bodyLimit in the root
// `_middleware.ts` (test/app/routes/_middleware.ts: /upload takes 1000 bytes, the rest 10 MB), its 413 an
// HTTPException, so it renders the error page.
const app = createApp({ bodyLimit: false })
const form = { Origin: 'http://localhost', 'Content-Type': 'application/x-www-form-urlencoded' }
const post = (path: string, size: number, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { ...form, ...headers },
    body: 'a=' + 'b'.repeat(size - 2),
  })
const dataOf = (text: string) =>
  JSON.parse(
    text
      .match(/<script data-page="app" type="application\/json">(.*?)<\/script>/)![1]!
      .replace(/\\\//g, '/'),
  ) as { component: string; props: Record<string, unknown> }

test('the route with its own limit: under it, received', async () => {
  const res = await post('/upload', 900)
  expect([res.status, await res.text()]).toEqual([200, '900'])
})
test('over it: the error page with the shared props, for a document and a navigation', async () => {
  const doc = await post('/upload', 1500, { Accept: 'text/html' })
  expect(doc.status).toBe(413)
  expect(dataOf(await doc.text())).toMatchObject({
    component: '_error',
    props: { status: 413, app: 'test' },
  })
  const nav = await post('/upload', 1500, { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' })
  expect(nav.status).toBe(413)
  expect(await nav.json()).toMatchObject({
    component: '_error',
    props: { status: 413, app: 'test' },
  })
})
test('an API client gets the status alone', async () => {
  const res = await post('/upload', 1500, { 'Content-Type': 'application/json' })
  expect([res.status, await res.text()]).toEqual([413, ''])
})
test('another route is not held to it', async () => {
  expect((await post('/items', 1500)).status).not.toBe(413)
})
test('the app has no limit of its own: the recipe is the only one', async () => {
  const res = await app.request('/items', {
    method: 'POST',
    headers: form,
    body: 'a'.repeat(11 * 1024 * 1024),
  })
  expect(res.status).toBe(413)
})
