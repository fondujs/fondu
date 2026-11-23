import { createApp } from 'fondu'
import { afterEach, expect, test, vi } from 'vitest'

const app = createApp()
const html = { Accept: 'text/html' }
const TRICKY = '</script><!-- <script>alert(1)</script> \u2028 \u2029 a/b \\/ -->'
const OPEN = '<script data-page="app" type="application/json">'

afterEach(() => vi.restoreAllMocks())

const embedded = (text: string) => {
  const start = text.indexOf(OPEN)
  const end = text.indexOf('</script>', start)
  return text.slice(start + OPEN.length, end)
}

test('the page data holds </script>, <!--, U+2028 and U+2029 and still parses; it cannot close its script', async () => {
  const text = await (await app.request('/payload', { headers: html })).text()
  const json = embedded(text)
  // the first `</script>` after the opening tag is the data's own end: nothing inside it closed the script early
  expect(text.slice(text.indexOf(OPEN) + OPEN.length + json.length)).toMatch(
    /^<\/script><div id="app">/,
  )
  expect(json).not.toMatch(/<[!/]/)
  expect(json).not.toContain('<script')
  expect(JSON.parse(json)).toMatchObject({ component: 'payload', props: { text: TRICKY } })
})
test('a / is written as it is (the < escape covers </script> and <!--)', async () => {
  const json = embedded(await (await app.request('/payload', { headers: html })).text())
  expect(json).toContain('a/b')
  expect(json).toContain('\\u003c/script>')
})
test('a props mutation while rendering does not change the page data', async () => {
  const text = await (await app.request('/payload', { headers: html })).text()
  expect(JSON.parse(embedded(text)).props.items).toEqual(['a'])
  // the render did mutate its (copy of the) props
  expect(text).toContain('<p>')
})
test('the page is stringified once for a document', async () => {
  const stringify = vi.spyOn(JSON, 'stringify')
  const res = await app.request('/payload', { headers: html })
  await res.text()
  const ofPage = stringify.mock.calls.filter(
    ([value]) => (value as { component?: string } | null)?.component === 'payload',
  )
  expect(ofPage).toHaveLength(1)
})
