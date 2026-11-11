/// <reference path="../virtual.d.ts" />
import type { Context, MiddlewareHandler } from 'hono'
import type { ReactElement } from 'react'
import { assetTags } from 'virtual:fondu/assets'
import { renderMarkup, renderPage } from 'virtual:fondu/ssr'

import type { Page } from '../client/navigation.js'
import { SCROLL_KEY, SCROLL_STORAGE } from '../paths.js'
import { nonceOf } from './http.js'

/**
 * The HTML document around a page: `{head}` and `{body}` (in JSX, or `${head}` in a string) are where the page goes.
 * An inline `<script>` of a JSX document gets the request's nonce, so the Content Security Policy runs it; a string's
 * writes it: `<script nonce="${nonce}">`.
 */
export interface DocumentParts {
  /** the tags the page renders (`<title>`, `<meta>`: server render), then the client's styles and scripts */
  head: string
  /** the page data (`<script data-page>`) and the rendered page (`<div id="app">`) */
  body: string
  c: Context
  /** the request's Content Security Policy nonce (`''` without one) */
  nonce: string
}
/** the document as JSX (`<html>…</html>`), or as an HTML string */
export type DocumentTemplate = (parts: DocumentParts) => ReactElement | string

const defaultTemplate: DocumentTemplate = ({ head, body }) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`

/** the options of the app (`createApp`) a request belongs to */
export const settings = new WeakMap<Context, { document?: DocumentTemplate; errorPage: boolean }>()

const browserOnly = new WeakSet<Context>()

/**
 * Pages of these requests are rendered in the browser only (Laravel's `withoutSsr`): in `routes/admin/_middleware.ts`,
 * `export default withoutSsr()`; for one route, `defineHandler(withoutSsr(), …)`. No server rendering at all:
 * `fondu({ ssr: false })`.
 */
export const withoutSsr = (): MiddlewareHandler => async (c, next) => {
  browserOnly.add(c)
  await next()
}

/** the page data, `/` and `<` escaped (no `</script>` in it), no HTML entities */
const pageScript = (page: Page) =>
  `<script data-page="app" type="application/json">${JSON.stringify(page).replace(/\//g, '\\/').replace(/</g, '\\u003c')}</script>`

/**
 * A reload, Back to a page of another site: this entry's position, where fondu/client left it, before the first
 * paint (the stylesheets are in: the page is laid out), and again once the page has loaded: browsers scroll on
 * their own until then (to the #fragment, WebKit and Firefox), fondu/client keeping their restoration off. Not once
 * the visitor has scrolled, typed or clicked: their own scrolling wins.
 */
const restoreScroll = `try{var k=history.state&&history.state[${JSON.stringify(SCROLL_KEY)}],p=k&&JSON.parse(sessionStorage.getItem(${JSON.stringify(SCROLL_STORAGE)}+k));if(p){var go=function(){scrollTo(+p.x||0,+p.y||0)},off=function(){go=0};go();["wheel","touchstart","keydown","mousedown"].forEach(function(t){addEventListener(t,off,{once:!0,passive:!0})});addEventListener("load",function(){setTimeout(function(){go&&go()})})}}catch(e){}`

// where the page goes, in the document a template returns: replaced before the page is in, so a page's content is
// never read as one
const HEAD = 'fondu:document-head'
const BODY = 'fondu:document-body'

/**
 * The document's own markup. JSX: rendered (no whitespace between tags), its inline scripts given the nonce. A string
 * is taken as it is: what it interpolates isn't escaped, so a nonce added there would run whatever got in.
 */
async function shell(
  template: DocumentTemplate,
  c: Context,
  nonce: string | undefined,
): Promise<string> {
  const out = template({ head: HEAD, body: BODY, c, nonce: nonce ?? '' })
  if (typeof out === 'string') return out
  const html = `<!doctype html>${await renderMarkup(out)}`
  if (!nonce) return html
  return html.replace(/<script\b(?![^>]*\s(?:src|nonce)=)/gi, `<script nonce="${nonce}"`)
}

let shellEndReported = false
/** once per process: every request would say the same */
function shellEndLost() {
  if (shellEndReported) return
  shellEndReported = true
  console.error(
    "[fondu] the end of the page's shell was not found in react-dom's output (bootstrapScriptContent): the document was sent whole, without its scroll script. Is react-dom a version Fondu supports?",
  )
}

/**
 * The document, streamed. First: the template's start, the stylesheets and the client's tags, the tags the page hoists
 * (React writes them before the page), the page data and the page's shell. Then what React adds as the Suspense
 * boundaries of the page resolve. Last: the template's end. The status and the headers are the loader's: sent with the
 * first byte. A string for a page that is not rendered here (`withoutSsr`, a shell that failed to render, a HEAD).
 * `whole`: wait for every boundary first (a prerendered page: no scripts of React's in the file, what
 * `renderToString` gave).
 */
export async function renderDocument(
  c: Context,
  page: Page,
  whole = false,
): Promise<string | ReadableStream<Uint8Array>> {
  const nonce = nonceOf(c)
  // the template first: one that is wrong fails before anything renders (no stream left running)
  const template = settings.get(c)?.document ?? defaultTemplate
  const html = await shell(template, c, nonce)
  const [before, between, after, ...more] = html.split(new RegExp(`${HEAD}|${BODY}`))
  if (after === undefined || more.length || html.indexOf(HEAD) > html.indexOf(BODY))
    throw new Error(
      'fondu: the document must have `head` once, in <head>, and `body` once, in <body>',
    )
  let ssr: ReadableStream<string> | null = null
  // per request: nothing the page renders can be it
  const marker = crypto.randomUUID()
  // what fails in a boundary is for the browser to render, and is logged. The shell's failure is logged below, once:
  // React reports it to `onError` too, so what it reports is held until the shell is known to be there
  const pending: unknown[] = []
  let live = false
  const late = (error: unknown) =>
    console.error(
      `[fondu] a Suspense boundary of "${page.component}" failed on the server, the browser renders it:`,
      error,
    )
  try {
    // a HEAD: Hono drops its body without cancelling it, so React would keep rendering for nothing
    if (renderPage && !browserOnly.has(c) && c.req.method !== 'HEAD') {
      // the page as the browser gets it, through JSON (a Date a string): the markup is the same on both sides
      const stream = await renderPage(JSON.parse(JSON.stringify(page)), {
        nonce,
        onError: (error) => (live ? late(error) : void pending.push(error)),
        // React writes this as a script right after the shell, before what the boundaries add: where `restoreScroll`
        // goes. Not as React's own script (it adds an `id`, and follows its `$RT` one), and not as a sibling of the
        // page in the tree: the page alone is the browser's tree (`useId()`)
        bootstrapScriptContent: marker,
      })
      if (whole) await stream.allReady
      ssr = stream.pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>)
      for (const error of pending) late(error)
      live = true
    }
  } catch (error) {
    // like Laravel: a page that fails to render on the server is still sent, and rendered in the browser
    console.error(
      `[fondu] server render of "${page.component}" failed, sending it to render in the browser:`,
      error,
    )
  }
  // the page data first: the client reads the first `script[data-page]` in the document, so nothing in the page's
  // content can come before it
  const data = pageScript(page)
  // the stylesheets first, right after <meta charset>: found, and asked for, before anything else of the head, the
  // document's own tags included (React puts a JSX document's links and metas before `head`). A browser that lays
  // the page out early (Firefox's, with its tools open) has them sooner
  const tags = assetTags(page.component, nonce)
  const css = tags.match(/<link rel="stylesheet"[^>]*>/g)?.join('') ?? ''
  const charset = /<meta charset=[^>]*>/i
  const top =
    css && charset.test(before) ? before.replace(charset, (meta) => meta + css) : before + css
  const start = top + tags.replace(/<link rel="stylesheet"[^>]*>/g, '')
  if (!ssr) return start + between + data + '<div id="app"></div>' + after
  // React's own: the tags the page hoists, the page (`<div id="app"`), and the script of `marker`, the end of the
  // shell (React writes the shell in as many chunks as it needs, so no chunk is its end): found across chunks.
  // This relies on React writing `bootstrapScriptContent` as one inline `<script>` right after the shell. A React
  // that writes it differently is reported (`shellEndLost`), not silently streamed without the scroll script.
  // Only what is new is searched: from where the last search ended, less the marker's length (a marker cut between
  // two chunks), so the work is linear in the shell, not quadratic
  const reader = ssr.getReader()
  const closing = '</script>'
  let text = ''
  let searchedTo = 0
  let open = -1
  let close = -1
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += value
    let from = Math.max(0, searchedTo - marker.length)
    let hit = text.indexOf(marker, from)
    while (hit >= 0) {
      // `<script …>marker</script>`, and nothing else
      const tagAt = text.lastIndexOf('<script', hit)
      if (tagAt >= 0 && /^<script[^>]*>$/.test(text.slice(tagAt, hit))) {
        const markerEnd = hit + marker.length
        // the closing tag may still be in the next chunk
        if (text.length < markerEnd + closing.length) break
        if (text.startsWith(closing, markerEnd)) {
          open = tagAt
          close = markerEnd + closing.length
        }
      }
      if (close >= 0) break
      from = hit + marker.length
      hit = text.indexOf(marker, from)
    }
    if (close >= 0) break
    // a marker found but not complete yet is searched for again, from where it is
    searchedTo = hit >= 0 ? hit : text.length
  }
  if (close < 0) shellEndLost()
  const at = Math.max(text.indexOf('<div id="app"'), 0)
  const script = `<script${nonce ? ` nonce="${nonce}"` : ''}>${restoreScroll}</script>`
  // the position back for a page rendered here (one rendered in the browser has nothing to scroll yet): in the
  // shell, right after the page, before what the boundaries add
  const streamed = close < 0 ? text : text.slice(0, open) + script + text.slice(close)
  const out = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        out.encode(start + streamed.slice(0, at) + between + data + streamed.slice(at)),
      )
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
