import { expect, test, type Page } from '@playwright/test'

// What a form's check sees of a file field is what the server will: the file name (empty without a file) in a URL-encoded
// or text/plain body, the file in a multipart one. By the form's `enctype`, the submitter's `formenctype` first.
const file = { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }
const seen = (page: Page) => page.evaluate(() => (window as { seen?: string }).seen)

const NAMED = ['name:', 'name:a.txt'] as const
const FILE = ['absent', 'file:a.txt'] as const

// `seen`: without a file, with one. The server reads URL-encoded and multipart bodies; a text/plain one it refuses.
const cases: Array<{
  name: string
  query: string
  button: string
  seen: readonly string[]
  server: boolean
}> = [
  { name: 'no enctype', query: '', button: 'default', seen: NAMED, server: true },
  {
    name: 'enctype multipart',
    query: '?enctype=multipart/form-data',
    button: 'default',
    seen: FILE,
    server: true,
  },
  {
    name: 'enctype text/plain',
    query: '?enctype=text/plain',
    button: 'default',
    seen: NAMED,
    server: false,
  },
  {
    name: 'formenctype multipart over none',
    query: '',
    button: 'multipart',
    seen: FILE,
    server: true,
  },
  {
    name: 'formenctype urlencoded over multipart',
    query: '?enctype=multipart/form-data',
    button: 'urlencoded',
    seen: NAMED,
    server: true,
  },
  {
    name: 'formenctype text/plain over multipart',
    query: '?enctype=multipart/form-data',
    button: 'plain',
    seen: NAMED,
    server: false,
  },
]

for (const { name, query, button, seen: expected, server } of cases) {
  for (const [label, withFile] of [
    ['without a file', false],
    ['with a file', true],
  ] as const) {
    test(`${name}, ${label}: the check sees what the server will`, async ({ page }) => {
      await page.goto(`/checked-file${query}`)
      await page.waitForFunction(() => history.state?.__fondu)
      if (withFile) await page.setInputFiles('input[type=file]', file)
      await page.click(`#${button}`)
      const want = expected[withFile ? 1 : 0]!
      expect(await seen(page)).toBe(want)
      if (server) await expect(page.locator('#received')).toHaveText(want)
    })
  }
}
