import { createApp } from 'fondu'
import { afterEach, expect, test, vi } from 'vitest'

import { arm, release } from './app/routes/_stream/gate.js'

// a react-dom that writes `bootstrapScriptContent` differently (here: not at all): the marker is never in its output
const react = vi.hoisted(() => ({ drop: false }))
vi.mock('virtual:fondu/ssr', async (importOriginal) => {
  const real = await importOriginal<typeof import('virtual:fondu/ssr')>()
  return {
    ...real,
    renderPage: (page: never, options: { bootstrapScriptContent?: string }, ...rest: never[]) =>
      (real.renderPage as (...args: unknown[]) => unknown)(
        page,
        react.drop ? { ...options, bootstrapScriptContent: undefined } : options,
        ...rest,
      ),
  }
})

afterEach(() => vi.restoreAllMocks())

test("react-dom's output without the shell's end: the document whole, and an error that says so", async () => {
  react.drop = true
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  arm()
  release()
  const res = await createApp().request('/stream', { headers: { Accept: 'text/html' } })
  const text = await res.text()
  expect(res.status).toBe(202)
  expect(text).toContain('<p id="late">Late content</p>')
  expect(text.endsWith('</html>')).toBe(true)
  expect(text).not.toContain('history.state')
  expect(error).toHaveBeenCalledTimes(1)
  expect(error).toHaveBeenCalledWith(
    "[fondu] the end of the page's shell was not found in react-dom's output (bootstrapScriptContent): the document was sent whole, without its scroll script. Is react-dom a version Fondu supports?",
  )
})
