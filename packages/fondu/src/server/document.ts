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

/** Renders the pages of these requests in the browser only. For no server rendering at all: `fondu({ ssr: false })`. */
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

let shellEndReported = false
function shellEndLost() {
  if (shellEndReported) return
  shellEndReported = true
  console.error(
    "[fondu] the end of the page's shell was not found in react-dom's output (bootstrapScriptContent): the document was sent whole, without its scroll script. Is react-dom a version Fondu supports?",
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
  // per request: nothing the page renders can be it
  const marker = crypto.randomUUID()
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
    if (renderPage && !browserOnly.has(c) && c.req.method !== 'HEAD') {
      // through JSON (a Date a string) so the markup is the same on both sides; a copy of its own, as what the render changes is not page data
      const stream = await renderPage(JSON.parse(json), {
        nonce,
        signal,
        onError: (error) => (live ? late(error) : void pending.push(error)),
        // React writes this as a script right after the shell, before what the boundaries add: where `restoreScroll` goes. Not
        // as React's own script (it adds an `id`), and not as a sibling of the page (the page alone is the browser's tree: `useId()`)
        bootstrapScriptContent: marker,
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
  // React's own: the tags the page hoists, the page (`<div id="app"`), and the script of `marker`, the end of the shell
  // (React writes the shell in many chunks, so no chunk is its end): found across chunks. This relies on React writing
  // `bootstrapScriptContent` as one inline `<script>` right after the shell. A React that writes it differently is reported
  // (`shellEndLost`). Only what is new is searched, less the marker's length (a marker cut between chunks): linear, not quadratic
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
      const tagAt = text.lastIndexOf('<script', hit)
      if (tagAt >= 0 && /^<script[^>]*>$/.test(text.slice(tagAt, hit))) {
        const markerEnd = hit + marker.length
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
