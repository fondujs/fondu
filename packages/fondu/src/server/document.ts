/// <reference path="../virtual.d.ts" />
import type { Context, MiddlewareHandler } from 'hono'
import type { ReactElement } from 'react'
import { assetTags } from 'virtual:fondu/assets'
import { renderMarkup, renderPage } from 'virtual:fondu/ssr'

import type { PageObject } from '../client/navigation.js'
import { SCROLL_KEY, SCROLL_STORAGE } from '../paths.js'
import { runsAsScript } from '../script-type.js'
import { nonceOf } from './http.js'

/**
 * The HTML document around a page: `{head}` and `{body}` are where the page goes. A JSX document's inline `<script>` gets
 * the request's nonce; a string's writes it: `<script nonce="${nonce}">`.
 */
export interface DocumentParts {
  head: string
  body: string
  c: Context
  /** the request's Content Security Policy nonce (`''` without one) */
  nonce: string
}
export type DocumentTemplate = (parts: DocumentParts) => ReactElement | string

const defaultTemplate: DocumentTemplate = ({ head, body }) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`

export const settings = new WeakMap<Context, { document?: DocumentTemplate; errorPage: boolean }>()

const browserOnly = new WeakSet<Context>()

/** Renders the pages of these requests in the browser only. */
export const withoutSsr = (): MiddlewareHandler => async (c, next) => {
  browserOnly.add(c)
  await next()
}

// `<` escaped, so nothing in it is `</script>` or `<!--`, the only ways out of a script's data
const pageScript = (json: string) =>
  `<script data-page="app" type="application/json">${json.replace(/</g, '\\u003c')}</script>`

// Browsers scroll on their own until the page has loaded (to the #fragment, WebKit and Firefox) while fondu/client keeps
// their restoration off: so the position is set before the first paint and again after load, unless the visitor has
// scrolled, typed or clicked.
const restoreScroll = `try{var k=history.state&&history.state[${JSON.stringify(SCROLL_KEY)}],p=k&&JSON.parse(sessionStorage.getItem(${JSON.stringify(SCROLL_STORAGE)}+k));if(p){var go=function(){scrollTo(+p.x||0,+p.y||0)},off=function(){go=0};go();["wheel","touchstart","keydown","mousedown"].forEach(function(t){addEventListener(t,off,{once:!0,passive:!0})});addEventListener("load",function(){setTimeout(function(){go&&go()})})}}catch(e){}`

// replaced before the page is in, so a page's content is never read as one
const HEAD = 'fondu:document-head'
const BODY = 'fondu:document-body'

// JSX is rendered and its inline scripts get the nonce. A string is taken as it is: what it interpolates isn't escaped,
// so a nonce added there would run whatever got in.
async function shell(
  template: DocumentTemplate,
  c: Context,
  nonce: string | undefined,
): Promise<string> {
  const out = template({ head: HEAD, body: BODY, c, nonce: nonce ?? '' })
  if (typeof out === 'string') return out
  const html = `<!doctype html>${await renderMarkup(out)}`
  if (!nonce) return html
  // a data block (`application/ld+json`) never runs, so the policy has nothing to allow
  return html.replace(/<script\b([^>]*)/gi, (tag, attrs: string) =>
    /\s(?:src|nonce)=/.test(attrs) || !runsAsScript(attrs)
      ? tag
      : `<script nonce="${nonce}"${attrs}`,
  )
}

// `whole`: wait for every boundary first (a prerendered page has no React scripts in the file). A string for a page not
// rendered here (`withoutSsr`, a shell that failed to render, a HEAD).
export async function renderDocument(
  c: Context,
  page: PageObject,
  whole = false,
): Promise<string | ReadableStream<Uint8Array>> {
  const nonce = nonceOf(c)
  // the template first: a wrong one fails before anything renders
  const template = settings.get(c)?.document ?? defaultTemplate
  const html = await shell(template, c, nonce)
  const [before, between, after, ...more] = html.split(new RegExp(`${HEAD}|${BODY}`))
  if (after === undefined || more.length || html.indexOf(HEAD) > html.indexOf(BODY))
    throw new Error(
      'fondu: the document must have `head` once, in <head>, and `body` once, in <body>',
    )
  // the page once as JSON: the document's data, and what the render gets a fresh copy of
  const json = JSON.stringify(page)
  let ssr: ReadableStream<string> | null = null
  // what fails in a boundary is for the browser to render, and is logged. React reports the shell's failure to `onError`
  // too, so it is held until the shell is known to be there, and logged below, once
  const pending: unknown[] = []
  let live = false
  // The client left: React reports the signal's reason to `onError` (an AbortError, or Node's string): not an error of the page
  const { signal } = c.req.raw
  const clientLeft = (error: unknown) => signal.aborted && error === signal.reason
  const late = (error: unknown) => {
    if (!clientLeft(error))
      console.error(
        `[fondu] a Suspense boundary of "${page.component}" failed on the server, the browser renders it:`,
        error,
      )
  }
  try {
    // a HEAD: Hono drops its body without cancelling it, so React would keep rendering for nothing
    if (!browserOnly.has(c) && c.req.method !== 'HEAD') {
      // through JSON (a Date a string) so the markup is the same on both sides; a copy of its own, as what the render changes is not page data
      const stream = await renderPage(JSON.parse(json), {
        nonce,
        signal,
        onError: (error) => (live ? late(error) : void pending.push(error)),
        // React writes it as an inline script (with the nonce) right after the shell, before what the boundaries add: the
        // position back for a page rendered here. Not as a sibling of the page: the page alone is the browser's tree (`useId()`)
        // relies on React writing this script right after the shell (stream.test.ts checks it)
        bootstrapScriptContent: restoreScroll,
      })
      if (whole) await stream.allReady
      ssr = stream.pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>)
      for (const error of pending) late(error)
      live = true
    }
  } catch (error) {
    // the error page's failure goes to `errorResponse`: plain text with the status (the browser would render the same props
    // and most likely fail again)
    if (page.component === '_error') throw error
    // like Laravel: a page that fails to render on the server is still sent, and rendered in the browser. Not logged if
    // the client left before the shell was there
    if (!clientLeft(error))
      console.error(
        `[fondu] server render of "${page.component}" failed, sending it to render in the browser:`,
        error,
      )
  }
  // the page data first: the client reads the first `script[data-page]` in the document, so nothing in the page's
  // content can come before it
  const data = pageScript(json)
  // the stylesheets first, right after <meta charset>: found before anything else of the head (React puts a JSX document's
  // links and metas before `head`)
  const tags = assetTags(page.component, nonce)
  const css = tags.match(/<link rel="stylesheet"[^>]*>/g)?.join('') ?? ''
  const charset = /<meta charset=[^>]*>/i
  const top =
    css && charset.test(before) ? before.replace(charset, (meta) => meta + css) : before + css
  const start = top + tags.replace(/<link rel="stylesheet"[^>]*>/g, '')
  if (!ssr) return start + between + data + '<div id="app"></div>' + after
  // React's own: the tags the page hoists, then the page (`<div id="app"`): the page data goes before it, found across chunks
  const reader = ssr.getReader()
  const app = '<div id="app"'
  let text = ''
  let at = -1
  while (at < 0) {
    const { done, value } = await reader.read()
    if (done) break
    const from = Math.max(0, text.length - app.length)
    text += value
    at = text.indexOf(app, from)
  }
  at = Math.max(at, 0)
  const out = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(out.encode(start + text.slice(0, at) + between + data + text.slice(at)))
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (!done) return controller.enqueue(out.encode(value))
      controller.enqueue(out.encode(after))
      controller.close()
    },
    // the visitor left: React stops (its abort reaches `onError`: not an error of the page)
    cancel(reason) {
      live = false
      return reader.cancel(reason)
    },
  })
}
