// navigate() and loadDocument() before the app has started (no document): what they hand to `location`
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { loadDocument, navigate } from '../src/client/navigation.js'

const assign = vi.fn()
const replace = vi.fn()

beforeEach(() => {
  vi.stubGlobal('location', {
    href: 'http://localhost/a',
    origin: 'http://localhost',
    pathname: '/a',
    search: '',
    assign,
    replace,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

for (const [name, run] of [
  ['navigate()', navigate],
  ['loadDocument()', loadDocument],
] as const) {
  test(`${name}: a javascript: URL throws, whatever its case or leading space`, () => {
    for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', '\n\tJAVASCRIPT:alert(1)']) {
      expect(() => run(url), url).toThrow(/javascript:/)
      expect(() => run(url, { replace: true } as never), url).toThrow(/javascript:/)
    }
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  test(`${name}: mailto: and another site's http(s) URL are handed to the browser`, () => {
    run('mailto:ada@example.com')
    run('https://example.org/page')
    expect(assign.mock.calls).toEqual([['mailto:ada@example.com'], ['https://example.org/page']])
  })
}

test('navigate(): a javascript: URL throws with shallow too', () => {
  expect(() => navigate('javascript:alert(1)', { shallow: true })).toThrow(/refusing/)
})
