import { createApp } from 'fondu'
import { afterEach, describe, expect, test, vi } from 'vitest'

const app = createApp()
const nav = { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' }

afterEach(() => vi.restoreAllMocks())

describe('a promise as a prop', () => {
  test('a promise as a top-level prop: an error that names the prop and says to await it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const headers of [{ Accept: 'text/html' }, nav]) {
      const res = await app.request('/promises?promise', { headers })
      expect(res.status).toBe(500)
    }
    const html = await (
      await app.request('/promises?promise', { headers: { Accept: 'text/html' } })
    ).text()
    expect(html).toContain('the prop &#34;late&#34; of &#34;promises&#34; is a promise')
    expect(html).toContain('Await it')
    expect(html).not.toContain('defer')
    const res = await app.request('/promises?promise=thenable', { headers: nav })
    expect(res.status).toBe(500)
  })
  test('a promise inside a prop is not checked: the top level only', async () => {
    const res = await app.request('/promises?nested', { headers: nav })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { props: { inner: unknown } }).props.inner).toEqual({ late: {} })
  })
})
